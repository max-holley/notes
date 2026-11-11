import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import { useEffect, useState } from 'react';
import { brand } from '../brand/brand.config.ts';
import { PRIVACY_SECTIONS } from './privacyText.ts';

export function Privacy() {
  const [q, setQ] = useState('');
  useEffect(() => {
    document.title = `Privacy policy · ${brand.appName}`;
  }, []);
  const shown = PRIVACY_SECTIONS.filter((s) => !q || (s.title + s.body.join(' ')).toLowerCase().includes(q.toLowerCase()));
  return (
    <Container component="main" maxWidth="md" sx={{ py: 4 }}>
      <Button href="/app" startIcon={<ArrowBackOutlined />} sx={{ mb: 2 }}>
        Back to {brand.appName}
      </Button>
      <Typography variant="h4" component="h1" gutterBottom>
        Privacy policy
      </Typography>
      <TextField
        fullWidth
        size="small"
        placeholder="Search sections…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{ htmlInput: { 'aria-label': 'Search sections' }, input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }}
        sx={{ mb: 3 }}
      />
      {shown.length === 0 && <Typography color="text.secondary">No matching sections</Typography>}
      {shown.map((s) => (
        <Box component="section" key={s.id} id={s.id} sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            {s.title}
          </Typography>
          {s.body.map((p, i) => (
            <Typography key={i} variant="body1" color="text.secondary" paragraph>
              {p}
            </Typography>
          ))}
        </Box>
      ))}
    </Container>
  );
}
