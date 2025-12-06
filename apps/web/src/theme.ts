import { createTheme } from '@mui/material/styles';
import { Roboto } from 'next/font/google';

export const roboto = Roboto({
    weight: ['300', '400', '500', '700'],
    subsets: ['latin'],
    display: 'swap',
});

// Premium Dark Theme
const theme = createTheme({
    palette: {
        mode: 'dark',
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
            default: '#0f172a', // Slate 900
            paper: '#1e293b', // Slate 800
        },
        text: {
            primary: '#f1f5f9', // Slate 100
            secondary: '#94a3b8', // Slate 400
        },
    },
    typography: {
        fontFamily: roboto.style.fontFamily,
        h1: {
            fontSize: '3rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
        },
        h2: {
            fontSize: '2.25rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
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
                },
            },
        },
    },
});

export default theme;
