import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AppBar,
  Toolbar,
  Container,
  Box,
  Button,
  Typography,
  useTheme
} from '@mui/material';

export default function Header() {
  const router = useRouter();
  const theme = useTheme();

  const isActive = (path: string) => router.pathname === path;

  const navItems = [
    { label: '홈', path: '/' },
    { label: '상위종목', path: '/top-stocks' },
    { label: '계산기', path: '/intrinsic-value' },
    { label: '버핏분석', path: '/stock-analysis' },
    { label: 'MaddingStock', path: '/maddingstock' },
    { label: '사용자', path: '/users' },
  ];

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        backdropFilter: 'blur(12px)',
        backgroundColor: (theme) => `rgba(${parseInt(theme.palette.background.default.slice(1, 3), 16)}, ${parseInt(theme.palette.background.default.slice(3, 5), 16)}, ${parseInt(theme.palette.background.default.slice(5, 7), 16)}, 0.8)`,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link href="/" passHref legacyBehavior>
            <Box component="a" sx={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <Typography
                variant="h5"
                noWrap
                component="div"
                sx={{
                  mr: 2,
                  fontWeight: 800,
                  letterSpacing: '.1rem',
                  background: `linear-gradient(45deg, ${theme.palette.primary.main} 30%, ${theme.palette.secondary.main} 90%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                VALUE
              </Typography>
            </Box>
          </Link>

          {/* Nav Menu */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {navItems.map((item) => (
              <Link key={item.path} href={item.path} passHref legacyBehavior>
                <Button
                  component="a"
                  color="inherit"
                  sx={{
                    fontWeight: isActive(item.path) ? 700 : 500,
                    color: isActive(item.path) ? 'primary.main' : 'text.secondary',
                    '&:hover': {
                      color: 'text.primary',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
