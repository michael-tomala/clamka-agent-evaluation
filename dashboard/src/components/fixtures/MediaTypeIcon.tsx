import {
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  Image as ImageIcon,
  Description as FileIcon,
} from '@mui/icons-material';

interface MediaTypeIconProps {
  type: string;
}

export function MediaTypeIcon({ type }: MediaTypeIconProps) {
  switch (type) {
    case 'video':
      return <VideoIcon fontSize="small" color="primary" />;
    case 'audio':
      return <AudioIcon fontSize="small" color="secondary" />;
    case 'image':
      return <ImageIcon fontSize="small" color="success" />;
    default:
      return <FileIcon fontSize="small" />;
  }
}
