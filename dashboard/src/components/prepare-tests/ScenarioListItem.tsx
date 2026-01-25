import {
  Box,
  Checkbox,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { Scenario } from '../../api/client';

export interface ScenarioListItemProps {
  scenario: Scenario;
  selected: boolean;
  onToggle: () => void;
}

export function ScenarioListItem({ scenario, selected, onToggle }: ScenarioListItemProps) {
  return (
    <ListItem disablePadding>
      <ListItemButton dense onClick={onToggle}>
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox
            edge="start"
            checked={selected}
            tabIndex={-1}
            disableRipple
            size="small"
          />
        </ListItemIcon>
        <ListItemText
          primary={scenario.name}
          secondary={
            <Box component="span" sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Typography variant="caption" component="span" color="text.secondary">
                {scenario.id}
              </Typography>
              {scenario.tags?.map((tag) => (
                <Box
                  key={tag}
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    px: 0.5,
                    py: 0.1,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 0.5,
                    fontSize: 10,
                  }}
                >
                  {tag}
                </Box>
              ))}
            </Box>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}
