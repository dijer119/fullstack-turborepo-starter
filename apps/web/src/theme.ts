import { createTheme } from '@mui/material/styles';
import { Roboto } from 'next/font/google';

export const roboto = Roboto({
    weight: ['300', '400', '500', '700'],
    subsets: ['latin'],
    display: 'swap',
});

// Premium Light Theme
const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#06b6d4', // Cyan 500
            light: '#67e8f9', // Cyan 300
            dark: '#0891b2', // Cyan 600
            contrastText: '#fff',
        },
        secondary: {
            main: '#8b5cf6', // Violet 500
            light: '#a78bfa', // Violet 400
            dark: '#7c3aed', // Violet 600
            contrastText: '#fff',
        },
        background: {
            default: '#f8fafc', // Slate 50
            paper: '#ffffff', // White
        },
        text: {
            primary: '#0f172a', // Slate 900
            secondary: '#64748b', // Slate 500
        },
    },
    typography: {
        fontFamily: roboto.style.fontFamily,
        h1: {
            fontSize: '3rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#0f172a', // Explicit color for better contrast
        },
        h2: {
            fontSize: '2.25rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#0f172a',
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backdropFilter: 'blur(10px)',
                    // Add subtle border for light mode depth
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    // Ensure AppBar text is visible in light mode if transparent
                    color: '#0f172a',
                }
            }
        }
    },
});

export default theme;
