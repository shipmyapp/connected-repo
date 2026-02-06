import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  IconButton, 
  Stack, 
  Paper,
  CircularProgress,
  Tooltip,
  Alert
} from '@mui/material';
import { 
  PhotoCamera, 
  Mic, 
  Stop, 
  Delete, 
  CheckCircle, 
  Error as ErrorIcon,
  PlayArrow,
  Pause
} from '@mui/icons-material';

interface MediaCaptureProps {
  onCapture: (media: { 
    type: 'image' | 'voice'; 
    file: File; 
    field: 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl' 
  }) => void;
  uploads: any[]; // Upload status from TinyBase
}

export const MediaCapture: React.FC<MediaCaptureProps> = ({ onCapture, uploads }) => {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Business Card Front
  const handleFrontImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture({ type: 'image', file, field: 'visitingCardFrontUrl' });
    }
  };

  // Business Card Back
  const handleBackImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture({ type: 'image', file, field: 'visitingCardBackUrl' });
    }
  };

  // Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onCapture({ type: 'voice', file, field: 'voiceNoteUrl' });
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const getUploadStatus = (field: string) => {
    return uploads.find(u => u.field === field);
  };

  const renderStatus = (field: string) => {
    const upload = getUploadStatus(field);
    if (!upload) return null;

    switch (upload.status) {
      case 'uploading':
        return <CircularProgress size={20} />;
      case 'done':
        return <CheckCircle color="success" fontSize="small" />;
      case 'error':
        return (
          <Tooltip title={upload.error}>
            <ErrorIcon color="error" fontSize="small" />
          </Tooltip>
        );
      default:
        return <Typography variant="caption">Pending...</Typography>;
    }
  };

  return (
    <Box sx={{ mt: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Advanced Lead Capture
      </Typography>
      
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {/* Business Card Front */}
        <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
          <Typography variant="subtitle2" gutterBottom>
            Business Card (Front)
          </Typography>
          <Button
            variant="contained"
            component="label"
            startIcon={<PhotoCamera />}
            fullWidth
            sx={{ mb: 1 }}
          >
            Capture Front
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleFrontImage}
            />
          </Button>
          {renderStatus('visitingCardFrontUrl')}
        </Paper>

        {/* Business Card Back */}
        <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
          <Typography variant="subtitle2" gutterBottom>
            Business Card (Back)
          </Typography>
          <Button
            variant="outlined"
            component="label"
            startIcon={<PhotoCamera />}
            fullWidth
            sx={{ mb: 1 }}
          >
            Capture Back
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleBackImage}
            />
          </Button>
          {renderStatus('visitingCardBackUrl')}
        </Paper>

        {/* Voice Note */}
        <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
          <Typography variant="subtitle2" gutterBottom>
            Voice Note
          </Typography>
          {!recording ? (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<Mic />}
              fullWidth
              onClick={startRecording}
              sx={{ mb: 1 }}
            >
              Record Note
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              startIcon={<Stop />}
              fullWidth
              onClick={stopRecording}
              sx={{ mb: 1, animation: 'pulse 1.5s infinite' }}
            >
              Stop (Recording...)
            </Button>
          )}
          
          {audioUrl && (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
              <IconButton onClick={togglePlayback} size="small">
                {playing ? <Pause /> : <PlayArrow />}
              </IconButton>
              <audio 
                ref={audioRef} 
                src={audioUrl} 
                onEnded={() => setPlaying(false)} 
                hidden 
              />
              {renderStatus('voiceNoteUrl')}
            </Stack>
          )}
        </Paper>
      </Stack>

      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
          }
        `}
      </style>
    </Box>
  );
};
