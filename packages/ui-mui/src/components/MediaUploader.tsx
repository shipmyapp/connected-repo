import React from 'react';
import { 
  Box, 
  IconButton, 
  Stack, 
  Typography, 
  Paper, 
  Tooltip, 
  Badge,
  useTheme,
  alpha
} from '@mui/material';
import { 
  AddPhotoAlternateOutlined as AddIcon,
  Close as CloseIcon
} from '@mui/icons-material';

export interface MediaFile {
  id: string;
  file: File;
  previewUrl: string;
}

interface MediaUploaderProps {
  files: MediaFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  maxFiles?: number;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({ 
  files, 
  onAddFiles, 
  onRemoveFile, 
  maxFiles = 5 
}) => {
  const theme = useTheme();
  
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFiles = Array.from(event.target.files);
      const validFiles = selectedFiles.filter(file => {
        const isValidType = ALLOWED_TYPES.includes(file.type);
        const isValidSize = file.size <= MAX_FILE_SIZE;
        
        if (!isValidType) {
          console.warn(`[MediaUploader] File ${file.name} rejected: Unsupported type ${file.type}`);
        }
        if (!isValidSize) {
          console.warn(`[MediaUploader] File ${file.name} rejected: Exceeds 10MB limit`);
        }
        
        return isValidType && isValidSize;
      });

      if (validFiles.length > 0) {
        onAddFiles(validFiles);
      }
      
      // Reset input value so same file can be selected again if removed
      event.target.value = '';
    }
  };

  const isMaxReached = files.length >= maxFiles;

  return (
    <Stack 
      direction="row" 
      spacing={1.5} 
      sx={{ 
        overflowX: 'auto', 
        py: 2, 
        px: 0.5,
        minHeight: 120, 
        alignItems: 'center',
        '&::-webkit-scrollbar': { height: 6 },
        '&::-webkit-scrollbar-thumb': { 
          backgroundColor: alpha(theme.palette.text.primary, 0.1),
          borderRadius: 10
        }
      }}
    >
      {files.map((media) => (
        <Badge
          key={media.id}
          overlap="circular"
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          badgeContent={
            <IconButton 
              size="small" 
              onClick={() => onRemoveFile(media.id)}
              sx={{ 
                bgcolor: 'error.main', 
                color: 'white', 
                boxShadow: 2,
                '&:hover': { bgcolor: 'error.dark' },
                width: 22,
                height: 22,
                p: 0,
                border: `2px solid ${theme.palette.background.paper}`
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          }
        >
          <Paper
            elevation={2}
            sx={{
              width: 100,
              height: 100,
              borderRadius: 3,
              overflow: 'hidden',
              position: 'relative',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'scale(1.02)',
              }
            }}
          >
            <Box
              component="img"
              src={media.previewUrl}
              alt="preview"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </Paper>
        </Badge>
      ))}

      {!isMaxReached && (
        <Tooltip title={`Add Media (${files.length}/${maxFiles})`}>
          <Box
            component="label"
            sx={{
              width: 100,
              height: 100,
              minWidth: 100,
              borderRadius: 3,
              border: `2px dashed ${alpha(theme.palette.divider, 0.5)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              bgcolor: alpha(theme.palette.action.hover, 0.4),
              '&:hover': {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                color: theme.palette.primary.main,
                boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.08)}`,
              },
            }}
          >
            <input
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={handleFileChange}
            />
            <AddIcon sx={{ fontSize: 32, mb: 0.5, opacity: 0.6 }} />
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 700, 
                fontSize: '0.65rem',
                letterSpacing: 0.5,
                opacity: 0.8 
              }}
            >
              ADD MEDIA
            </Typography>
          </Box>
        </Tooltip>
      )}

      {files.length === 0 && (
        <Box sx={{ ml: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, opacity: 0.7 }}>
            No media attached
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
            Up to {maxFiles} images
          </Typography>
        </Box>
      )}
    </Stack>
  );
};
