import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import { brand } from '../brand/brand.config.ts';
import brandAssets from 'virtual:brand-assets';
import { signInUrl } from '../lib/api.ts';
import { hasSignedInBefore } from '../lib/localPrefs.ts';
import { BACKEND_STORES } from './privacyText.ts';

const HIGHLIGHTS = [
  { icon: EditNoteOutlined, title: 'Rich notes', text: 'Headings, checklists, tables, sections, images and links, with categories and tags to keep it all tidy.' },
  { icon: CloudOutlined, title: 'Stored in your Drive', text: 'Your notes live in a folder in your own Google Drive. Nothing is kept on our servers.' },
  { icon: TaskAltOutlined, title: 'Tasks and Calendar', text: 'Turn checklist lines into Google Tasks with due dates, and start meeting notes from your calendar.' },
  { icon: LockOutlined, title: 'Private by design', text: 'No analytics, no ads, no third-party calls. Your browser talks to Google directly.' },
];

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  bad_state: 'Sign-in expired or was tampered with. Please try again.',
  exchange_failed: 'Google sign-in failed. Please try again.',
};

export function Landing({ returnTo }: { returnTo: string }) {
  const error = new URLSearchParams(location.search).get('auth_error');
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box component="header" sx={{ px: { xs: 2, sm: 4 }, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {brandAssets.logoUrl && <Box component="img" src={brandAssets.logoUrl} alt="" sx={{ height: 32 }} />}
        <Typography variant="h6" component="span">
          {brand.appName}
        </Typography>
      </Box>
      <Container component="main" maxWidth="md" sx={{ flex: 1, py: { xs: 4, sm: 8 } }}>
        <Stack spacing={3} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.8125rem' }, lineHeight: 1.2 }}>
            {hasSignedInBefore() ? 'Welcome back.' : 'Your notes, in your own Google Drive.'}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560 }}>
            {brand.description}
          </Typography>
          {error && (
            <Alert severity="warning" sx={{ textAlign: 'left' }}>
              {AUTH_ERRORS[error] ?? 'Sign-in failed. Please try again.'}
            </Alert>
          )}
          <Button variant="contained" size="large" href={signInUrl(returnTo)} sx={{ px: 4 }}>
            Continue with Google
          </Button>
          <Typography variant="caption" color="text.secondary">
            New here? Continuing creates your account. There are no passwords.
          </Typography>
        </Stack>
        <Box
          component="section"
          aria-label="Highlights"
          sx={{ mt: { xs: 6, sm: 8 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
        >
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <Card key={title} variant="outlined" sx={{ bgcolor: 'm3.surfaceContainerLow' }}>
              <CardContent>
                <Icon color="primary" aria-hidden />
                <Typography variant="subtitle1" component="h2" sx={{ mt: 1 }}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {text}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
        <Card variant="outlined" component="section" aria-labelledby="privacy-note" sx={{ mt: 2, bgcolor: 'm3.surfaceContainer' }}>
          <CardContent>
            <Typography id="privacy-note" variant="subtitle1" component="h2">
              What our server stores
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {BACKEND_STORES}
            </Typography>
          </CardContent>
        </Card>
      </Container>
      <Box component="footer" sx={{ px: 2, py: 3, textAlign: 'center' }}>
        <Link href="/privacy" variant="body2">
          Privacy policy
        </Link>
      </Box>
    </Box>
  );
}
