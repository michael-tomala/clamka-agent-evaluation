import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  History as HistoryIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  Visibility as VisionIcon,
} from '@mui/icons-material';

import PrepareTests from './pages/PrepareTests';
import ScenarioList from './pages/ScenarioList';
import Results from './pages/Results';
import ResultDetail from './pages/ResultDetail';
import ScenarioDetail from './pages/ScenarioDetail';
import FixturesPreview from './pages/FixturesPreview';
import ClaudeVisionScenes from './pages/ClaudeVisionScenes';

const DRAWER_WIDTH = 240;

const navItems = [
  { path: '/', label: 'Przygotuj testy', icon: <PlayIcon /> },
  { path: '/scenarios', label: 'Scenariusze', icon: <SettingsIcon /> },
  { path: '/results', label: 'Historia', icon: <HistoryIcon /> },
  { path: '/fixtures', label: 'Fixtures', icon: <StorageIcon /> },
  { path: '/claude-vision', label: 'Claude Vision', icon: <VisionIcon /> },
];

export default function App() {
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
        elevation={0}
      >
        <Toolbar>
          <AssessmentIcon sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
            Agent Evaluation Dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.default',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 2 }}>
          <List>
            {navItems.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  component={Link}
                  to={item.path}
                  selected={location.pathname === item.path}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <Routes>
          <Route path="/" element={<PrepareTests />} />
          <Route path="/scenarios" element={<ScenarioList />} />
          <Route path="/results" element={<Results />} />
          <Route path="/results/:suiteId" element={<ResultDetail />} />
          <Route path="/results/:suiteId/compare/:otherSuiteId" element={<ResultDetail />} />
          <Route path="/results/:suiteId/scenario/:scenarioId" element={<ScenarioDetail />} />
          <Route path="/fixtures" element={<FixturesPreview />} />
          <Route path="/claude-vision" element={<ClaudeVisionScenes />} />
        </Routes>
      </Box>
    </Box>
  );
}
