import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import pdfMake from "pdfmake/build/pdfmake";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";

export class ExportService {
  private pdfMakeInstance: any = null;

  /**
   * Lazily initializes pdfMake with vfs fonts.
   */
  private async ensureInitialized() {
    if (this.pdfMakeInstance) return;

    console.info("[ExportService] Initializing pdfMake and fonts...");
    try {
      const pdfFonts = await import("pdfmake/build/vfs_fonts");
      
      // Handle ESM default export or direct export
      const instance = (pdfMake as any).default || pdfMake;
      const vfs = (pdfFonts as any).default?.pdfMake?.vfs || (pdfFonts as any).pdfMake?.vfs;
      
      if (!vfs) {
        throw new Error("Could not find vfs in vfs_fonts");
      }

      instance.vfs = vfs;
      this.pdfMakeInstance = instance;
      console.info("[ExportService] Initialization complete.");
    } catch (err) {
      console.error("[ExportService] Initialization failed:", err);
      throw err;
    }
  }

  /**
   * Generates a CSV blob for the given journal entries.
   * Excludes deleted entries and the deletedAt column.
   */
  public async generateCSV(entries: JournalEntrySelectAll[]): Promise<Blob> {
    const activeEntries = entries.filter(e => !e.deletedAt);
    console.info(`[ExportService] Starting CSV export for ${activeEntries.length} active entries (filtered from ${entries.length}).`);
    
    const headers = [
      "Journal ID",
      "Created At",
      "Updated At",
      "Author User ID",
      "Prompt",
      "Prompt ID",
      "Content",
      "Attachments"
    ];

    try {
      const rows = activeEntries.map((entry, index) => {
        if (index % 100 === 0 && index > 0) {
          console.info(`[ExportService] CSV Progress: ${index}/${activeEntries.length}`);
        }

        const attachments = (entry.attachmentUrls || [])
          .map(([url, thumb]) => `${url}${thumb !== "not-available" ? ` (Thumb: ${thumb})` : ""}`)
          .join("; ");

        return [
          this.sanitizeCsvCell(entry.journalEntryId),
          this.sanitizeCsvCell(this.formatDate(entry.createdAt)),
          this.sanitizeCsvCell(this.formatDate(entry.updatedAt)),
          this.sanitizeCsvCell(entry.authorUserId),
          this.sanitizeCsvCell(entry.prompt ?? ""),
          this.sanitizeCsvCell(entry.promptId?.toString() ?? ""),
          this.sanitizeCsvCell(entry.content),
          this.sanitizeCsvCell(attachments)
        ];
      });

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      
      console.info("[ExportService] CSV generation completed.");
      return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    } catch (error) {
      console.error("[ExportService] CSV generation failed:", error);
      throw error;
    }
  }

  /**
   * Generates a PDF blob for the given journal entries using pdfmake.
   * Excludes deleted entries.
   */
  public async generatePDF(entries: JournalEntrySelectAll[]): Promise<Blob> {
    const activeEntries = entries.filter(e => !e.deletedAt);
    console.info(`[ExportService] Starting PDF export for ${activeEntries.length} active entries (filtered from ${entries.length}).`);
    
    await this.ensureInitialized();

    const tableBody: Content[][] = [
      [
        { text: "Date", style: "tableHeader" },
        { text: "Prompt", style: "tableHeader" },
        { text: "Content", style: "tableHeader" },
        { text: "Attachments", style: "tableHeader" }
      ]
    ];

    try {
      let i = 0;
      for (const entry of activeEntries) {
        if (i % 50 === 0 && i > 0) {
          console.info(`[ExportService] PDF Progress: ${i}/${activeEntries.length}`);
        }

        const attachments = (entry.attachmentUrls || [])
          .map(([url]) => url.split('/').pop())
          .join(", ");

        tableBody.push([
          { text: this.formatDate(entry.createdAt) },
          { text: entry.prompt || "N/A" },
          { text: entry.content.length > 1000 ? entry.content.substring(0, 1000) + "..." : entry.content },
          { text: attachments || "None" }
        ]);
        i++;
      }

      console.info("[ExportService] PDF: Table body generated. Creating document...");

      const docDefinition: TDocumentDefinitions = {
        pageOrientation: 'landscape',
        content: [
          { text: "Journal Entries Export", style: "header" },
          { text: `Exported on: ${this.formatDate(new Date())}`, style: "subtitle" },
          {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "*", "auto"],
              body: tableBody
            }
          }
        ],
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          subtitle: {
            fontSize: 12,
            italics: true,
            margin: [0, 0, 0, 20]
          },
          tableHeader: {
            bold: true,
            fontSize: 12,
            color: "black",
            fillColor: '#eeeeee'
          }
        },
        defaultStyle: {
          fontSize: 10
        }
      };

      console.info("[ExportService] PDF: Calling createPdf...");

      return new Promise((resolve, reject) => {
        try {
          if (!this.pdfMakeInstance) throw new Error("pdfMake not initialized");
          
          // Use timeout to prevent indefinite hang
          const timeout = setTimeout(() => {
            reject(new Error("PDF generation timed out (60s)"));
          }, 60000);

          const pdfDocGenerator = this.pdfMakeInstance.createPdf(docDefinition);
          console.info("[ExportService] PDF: Requesting Blob...");
          
          pdfDocGenerator.getBlob((blob: Blob) => {
            clearTimeout(timeout);
            console.info("[ExportService] PDF generation completed.");
            resolve(blob);
          });
        } catch (err) {
          console.error("[ExportService] PDF generation internal error:", err);
          reject(err);
        }
      });
    } catch (error) {
      console.error("[ExportService] PDF generation failed:", error);
      throw error;
    }
  }

  /**
   * Sanitizes a cell value to prevent CSV injection (formula execution).
   */
  private sanitizeCsvCell(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    
    const riskyChars = ['=', '+', '-', '@'];
    let sanitized = trimmed;
    
    if (riskyChars.some(char => trimmed.startsWith(char))) {
      sanitized = `'${trimmed}`;
    }

    if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }

    return sanitized;
  }

  private formatDate(date: string | number | Date): string {
    return new Date(date).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
}

export const exportService = new ExportService();
