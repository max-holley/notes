import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined';
import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined';
import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import { useState, type ReactNode } from 'react';
import brandAssets from 'virtual:brand-assets';
import { brand } from '../brand/brand.config.ts';
import { reconnectGoogle, signOut, syncNow } from '../app/session.ts';
import { useUi } from '../store/ui.ts';

const SYNC_UI = {
  idle: { label: 'Loading…', icon: <CloudSyncOutlined />, color: 'default' },
  synced: { label: 'Synced', icon: <CloudDoneOutlined />, color: 'default' },
  saving: { label: 'Saving…', icon: <CloudSyncOutlined />, color: 'default' },
  offline: { label: 'Offline – will retry', icon: <CloudOffOutlined />, color: 'warning' },
  reconnect: { label: 'Needs reconnect', icon: <LinkOffOutlined />, color: 'error' },
  error: { label: 'Sync error – will retry', icon: <ErrorOutlineOutlined />, color: 'warning' },
} as const;

export function SyncChip({ compact }: { compact?: boolean }) {
  const sync = useUi((s) => s.sync);
  const ui = SYNC_UI[sync];
  const onClick = () => (sync === 'reconnect' ? void reconnectGoogle() : syncNow());
  const tip = sync === 'reconnect' ? 'Reconnect Google' : 'Sync now (Ctrl+S)';
  return (
    <Tooltip title={tip}>
      {compact ? (
        <IconButton aria-label={`${ui.label}. ${tip}`} onClick={onClick} color={ui.color === 'default' ? 'inherit' : ui.color} data-testid="sync-status" data-status={sync}>
          {ui.icon}
        </IconButton>
      ) : (
        <Chip
          icon={ui.icon}
          label={ui.label}
          variant="outlined"
          color={ui.color}
          onClick={onClick}
          data-testid="sync-status"
          data-status={sync}
          aria-label={`${ui.label}. ${tip}`}
        />
      )}
    </Tooltip>
  );
}

export function AccountMenu() {
  const me = useUi((s) => s.me);
  const set = useUi((s) => s.set);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const open = (dialog: Parameters<typeof set>[0]['dialog']) => () => {
    close();
    set({ dialog });
  };
  const name = me?.user.name ?? me?.user.email ?? '';
  return (
    <>
      <Tooltip title={`Account: ${name}`}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={!!anchor}>
          <Avatar src={me?.user.picture ?? undefined} alt="" sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText', typography: 'subtitle2' }}>
            {name.slice(0, 1).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{me?.user.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {me?.user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={open('settings')}>
          <ListItemIcon><SettingsOutlined /></ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <MenuItem onClick={open('devices')}>
          <ListItemIcon><DevicesOutlined /></ListItemIcon>
          <ListItemText>Devices</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { close(); void signOut(); }}>
          <ListItemIcon><LogoutOutlined /></ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={open('deleteAccount')} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}><DeleteForeverOutlined /></ListItemIcon>
          <ListItemText>Disconnect &amp; delete data</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export function TopBar({ onMenu, title, compact, actions }: { onMenu?: () => void; title?: string; compact: boolean; actions?: ReactNode }) {
  return (
    <AppBar position="static" component="header">
      <Toolbar sx={{ gap: 1, minHeight: { xs: 64 } }}>
        {onMenu && (
          <IconButton edge="start" aria-label="Open navigation" onClick={onMenu}>
            <MenuOutlined />
          </IconButton>
        )}
        {brandAssets.logoUrl && <Box component="img" src={brandAssets.logoUrl} alt="" sx={{ height: 28 }} />}
        <Typography variant="h6" component="h1" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {title ?? brand.appName}
        </Typography>
        {actions}
        <SyncChip compact={compact} />
        <AccountMenu />
      </Toolbar>
    </AppBar>
  );
}
