import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { useWorkerQuery } from "@frontend/hooks/useWorkerQuery";
import type { LeadSelectAll } from "@connected-repo/zod-schemas/leads.zod";
import BusinessIcon from "@mui/icons-material/Business";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import LanguageIcon from "@mui/icons-material/Language";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import NotesIcon from "@mui/icons-material/Notes";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonIcon from "@mui/icons-material/Person";
import { 
  Container, 
  Box, 
  Paper, 
  Typography, 
  Stack, 
  Divider, 
  Avatar, 
  Button,
  useTheme
} from "@mui/material";
import { useParams, useNavigate } from "react-router";

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();

  const { data, isLoading, error } = useWorkerQuery<LeadSelectAll>({
    entity: 'leads',
    operation: 'getById',
    payload: { leadId: id },
  });

  if (isLoading) return (
    <Container sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
      <LoadingSpinner text="Fetching lead details..." />
    </Container>
  );
  
  if (error) return (
    <Container sx={{ py: 4 }}>
      <ErrorAlert message={`Error loading lead: ${error.message}`} />
      <Button sx={{ mt: 2 }} onClick={() => navigate('/leads')}>Back to Leads</Button>
    </Container>
  );
  
  const lead = data?.data;
  if (!lead) return (
    <Container sx={{ py: 4 }}>
      <ErrorAlert message="Lead not found." />
      <Button sx={{ mt: 2 }} onClick={() => navigate('/leads')}>Back to Leads</Button>
    </Container>
  );

  const formatDate = (date: number | string | Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4, pb: 10 }}>
      {/* Back Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/leads')}
          sx={{ fontWeight: 600 }}
        >
          Back to Leads
        </Button>
        <Typography variant="caption" color="text.secondary">
          Created on {formatDate(lead.createdAt)}
        </Typography>
      </Box>

      {/* Main Profile Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: { xs: 3, md: 5 }, 
          borderRadius: 4, 
          border: '1px solid', 
          borderColor: 'divider',
          bgcolor: 'background.paper',
          mb: 4
        }}
      >
        <Stack spacing={4}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 2, md: 4 } }}>
            <Avatar 
              src={(lead as any).visitingCardFrontUrl} 
              sx={{ 
                width: { xs: 80, md: 120 }, 
                height: { xs: 80, md: 120 }, 
                border: '3px solid', 
                borderColor: 'primary.main',
                boxShadow: 2
              }}
            >
              <PersonIcon sx={{ fontSize: { xs: 40, md: 60 } }} />
            </Avatar>
            <Box>
              <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5, letterSpacing: -1 }}>
                {lead.contactName}
              </Typography>
              {lead.jobTitle && (
                <Typography variant="h6" color="primary.main" sx={{ fontWeight: 600 }}>
                  {lead.jobTitle}
                </Typography>
              )}
              {lead.companyName && (
                <Typography variant="h6" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BusinessIcon fontSize="small" /> {lead.companyName}
                </Typography>
              )}
            </Box>
          </Box>

          <Divider />

          {/* Details Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
            {lead.email && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon fontSize="inherit" /> Email Address
                </Typography>
                <Typography variant="body1" component="a" href={`mailto:${lead.email}`} sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  {lead.email}
                </Typography>
              </Stack>
            )}
            {lead.phone && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon fontSize="inherit" /> Phone Number
                </Typography>
                <Typography variant="body1" component="a" href={`tel:${lead.phone}`} sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  {lead.phone}
                </Typography>
              </Stack>
            )}
            {lead.website && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LanguageIcon fontSize="inherit" /> Website
                </Typography>
                <Typography variant="body1" component="a" href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  {lead.website}
                </Typography>
              </Stack>
            )}
            {lead.address && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOnIcon fontSize="inherit" /> Address
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                  {lead.address}
                </Typography>
              </Stack>
            )}
          </Box>

          {lead.notes && (
            <Box sx={{ bgcolor: 'action.hover', p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <NotesIcon fontSize="inherit" /> Additional Notes
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                "{lead.notes}"
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      {/* Media Enhancements Section */}
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, px: 2 }}>Capture Enrichment</Typography>
      
      <Stack spacing={3}>
        <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>Business Cards</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" align="center" gutterBottom color="text.secondary">Front Perspective</Typography>
              {(lead as any).visitingCardFrontUrl ? (
                <Box 
                  component="img" 
                  src={(lead as any).visitingCardFrontUrl} 
                  sx={{ 
                    width: '100%', 
                    borderRadius: 3, 
                    border: '1px solid', 
                    borderColor: 'divider',
                    boxShadow: 1,
                    transition: 'transform 0.3s ease',
                    '&:hover': { transform: 'scale(1.02)' }
                  }} 
                />
              ) : (
                <Box sx={{ height: 150, bgcolor: 'action.hover', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" color="text.disabled">No Front Image</Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" align="center" gutterBottom color="text.secondary">Back Perspective</Typography>
              {(lead as any).visitingCardBackUrl ? (
                <Box 
                  component="img" 
                  src={(lead as any).visitingCardBackUrl} 
                  sx={{ 
                    width: '100%', 
                    borderRadius: 3, 
                    border: '1px solid', 
                    borderColor: 'divider',
                    boxShadow: 1,
                    transition: 'transform 0.3s ease',
                    '&:hover': { transform: 'scale(1.02)' }
                  }} 
                />
              ) : (
                <Box sx={{ height: 150, bgcolor: 'action.hover', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" color="text.disabled">No Back Image</Typography>
                </Box>
              )}
            </Box>
          </Stack>
        </Paper>

        {(lead as any).voiceNoteUrl && (
          <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider', bgcolor: 'primary.lighter' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>Transcription & Voice Note</Typography>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
              <Box 
                component="audio" 
                controls 
                src={(lead as any).voiceNoteUrl} 
                sx={{ width: '100%' }} 
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              The voice note is captured and processed as high-quality audio for your reference.
            </Typography>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
