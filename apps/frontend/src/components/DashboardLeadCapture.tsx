import React, { useState, useMemo, useEffect } from 'react';
import { 
  Box, 
  Card, 
  Stack, 
  Typography, 
  Button, 
  Drawer,
  IconButton,
  Fab,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { 
  PhotoCamera, 
  Mic, 
  Keyboard, 
  Close as CloseIcon,
  CheckCircle,
  GraphicEq
} from '@mui/icons-material';
import { MediaCapture } from '../modules/leads/components/MediaCapture';
import { CreateLeadForm } from '../modules/leads/components/CreateLeadForm';
import { dataWorkerClient } from '@frontend/worker/worker.client';
import { ulid } from 'ulid';

export function DashboardLeadCapture() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  
  // Current lead being captured (media-first)
  const [currentLeadId, setCurrentLeadId] = useState(ulid());

  // Subscribe to uploads for THIS currentLeadId
  useEffect(() => {
    const fetchUploads = async () => {
      const result = await dataWorkerClient.query<any[]>({
        entity: 'uploads',
        operation: 'getAll',
      });
      const leadUploads = result.data.filter(u => u.leadId === currentLeadId);
      setUploads(leadUploads);
    };

    const unsubscribe = dataWorkerClient.onPushEvent((ev) => {
      if (ev.type === 'push' && ev.event === 'table-changed' && ev.payload.table === 'uploads') {
        fetchUploads();
      }
    });

    fetchUploads();
    return unsubscribe;
  }, [currentLeadId]);

  const handleMediaCapture = async (media: { 
    type: 'image' | 'voice'; 
    file: File; 
    field: 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl' 
  }) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const localUrl = reader.result as string;
      await dataWorkerClient.mutate({
        entity: 'uploads',
        operation: 'create',
        payload: {
          localUrl,
          fileType: media.file.type,
          fileName: media.file.name,
          leadId: currentLeadId,
          field: media.field,
        }
      });
    };
    reader.readAsDataURL(media.file);
  };

  const hasMedia = uploads.length > 0;
  const isAllDone = uploads.every(u => u.status === 'done');

  const onFinalize = () => {
    // If they have media, they can finalize or open drawer for more details
    setDrawerOpen(true);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Instant Lead Capture
      </Typography>

      <Stack spacing={2}>
        <Card 
          elevation={0} 
          sx={{ 
            p: 4, 
            borderRadius: 4, 
            border: '2px dashed', 
            borderColor: hasMedia ? 'primary.main' : 'divider',
            bgcolor: 'background.paper',
            textAlign: 'center',
            position: 'relative'
          }}
        >
          <MediaCapture onCapture={handleMediaCapture} uploads={uploads} />
          
          {(hasMedia || isAllDone) && (
            <Button 
              variant="contained" 
              fullWidth 
              size="large" 
              startIcon={<Keyboard />}
              onClick={() => setDrawerOpen(true)}
              sx={{ mt: 2, py: 1.5, borderRadius: 2 }}
            >
              Add Lead Details
            </Button>
          )}
        </Card>

        {!hasMedia && (
          <Button 
            variant="text" 
            startIcon={<Keyboard />} 
            onClick={() => setDrawerOpen(true)}
            sx={{ fontWeight: 600 }}
          >
            Enter Details Manually
          </Button>
        )}
      </Stack>

      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: { 
            width: isMobile ? '100%' : 450,
            height: isMobile ? '90vh' : '100vh',
            borderRadius: isMobile ? '24px 24px 0 0' : 0,
            p: 3
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6" fontWeight={700}>Lead Information</Typography>
          <IconButton onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        
        {/* We need a version of CreateLeadForm that uses the currentLeadId and doesn't redirect? */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
           <CreateLeadForm 
              initialLeadId={currentLeadId} 
              onComplete={() => {
                setDrawerOpen(false);
                setCurrentLeadId(ulid()); // Reset for next capture
              }}
           />
        </Box>
      </Drawer>
    </Box>
  );
}
