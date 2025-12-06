import { useState, useEffect } from "react";
import Head from "next/head";
import {
  Container,
  Box,
  Typography,
  Paper,
  useTheme
} from "@mui/material";
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import Header from "../src/components/Header";

const quotes = [
  // 벤저민 그레이엄
  { text: "안전마진은 투자의 핵심이다.", author: "벤저민 그레이엄", book: "현명한 투자자" },
  { text: "투자란 철저한 분석을 통해 원금의 안전성과 만족스러운 수익률을 약속하는 것이다.", author: "벤저민 그레이엄", book: "현명한 투자자" },
  { text: "가격은 당신이 지불하는 것이고, 가치는 당신이 얻는 것이다.", author: "벤저민 그레이엄", book: "증권분석" },

  // 워렌 버핏
  { text: "좋은 기업을 적정 가격에 사는 것이 적정 기업을 좋은 가격에 사는 것보다 낫다.", author: "워렌 버핏", book: "" },
  { text: "주식시장은 인내심 없는 사람에서 인내심 있는 사람에게로 돈을 옮기는 장치다.", author: "워렌 버핏", book: "" },
  { text: "다른 사람이 탐욕스러울 때 두려워하고, 다른 사람이 두려워할 때 탐욕스러워라.", author: "워렌 버핏", book: "" },
  { text: "위험은 자신이 무엇을 하는지 모르는 데서 온다.", author: "워렌 버핏", book: "" },
  { text: "시장이 효율적이라면 나는 거지가 되었을 것이다.", author: "워렌 버핏", book: "" },

  // 피터 린치
  { text: "당신이 이해하지 못하는 회사의 주식을 사지 마라.", author: "피터 린치", book: "전설로 떠나는 월가의 영웅" },
  { text: "주식시장이 급락할 때가 돈을 벌 수 있는 기회다.", author: "피터 린치", book: "" },
  { text: "숫자를 모르면서 주식을 고르는 것은 카드를 보지 않고 포커를 하는 것과 같다.", author: "피터 린치", book: "" },

  // 존 템플턴
  { text: "투자에서 가장 위험한 네 단어는 이번엔 다르다이다.", author: "존 템플턴", book: "" },
  { text: "최고의 매수 기회는 비관론이 최고조일 때 온다.", author: "존 템플턴", book: "" },
  { text: "강세장은 비관론에서 태어나고, 회의론에서 자라나고, 낙관론에서 성숙하고, 행복감에서 죽는다.", author: "존 템플턴", book: "" },

  // 찰리 멍거
  { text: "투자는 간단하지만 쉽지는 않다.", author: "찰리 멍거", book: "" },
  { text: "위대한 기업이 공정한 가격에 거래될 때까지 기다리는 것이 핵심이다.", author: "찰리 멍거", book: "" },
  { text: "현명한 투자자는 낙관론자가 팔 때 사고, 비관론자가 팔 때 산다.", author: "찰리 멍거", book: "" },

  // 필립 피셔
  { text: "중요한 것은 주식을 얼마나 많이 사느냐가 아니라 무엇을 사느냐다.", author: "필립 피셔", book: "위대한 기업에 투자하라" },
  { text: "탁월한 기업의 주식을 적당한 가격에 사서 오래 보유하라.", author: "필립 피셔", book: "" },

  // 레이 달리오
  { text: "고통 + 반성 = 성장", author: "레이 달리오", book: "원칙" },
  { text: "성공한 사람들이 실패를 두려워하지 않는 것이 아니라, 실패를 극복하는 방법을 아는 것이다.", author: "레이 달리오", book: "원칙" },

  // 조지 소로스
  { text: "중요한 것은 옳고 그름이 아니라 옳을 때 얼마나 벌고 틀렸을 때 얼마나 잃는가다.", author: "조지 소로스", book: "" },
  { text: "시장은 항상 편향되어 있다. 중요한 것은 그 편향의 방향을 아는 것이다.", author: "조지 소로스", book: "" },

  // 존 보글
  { text: "시장 타이밍을 맞추려 하지 말고, 시장에 머물러라.", author: "존 보글", book: "" },
  { text: "비용은 중요하다. 당신이 투자에서 얻는 것은 당신이 지불하지 않은 것이다.", author: "존 보글", book: "" },

  // 하워드 막스
  { text: "좋은 투자를 하기 위해서는 남들과 다르게 생각하고 옳아야 한다.", author: "하워드 막스", book: "투자에 대한 생각" },
  { text: "위험은 일어날 수 있는 일이 일어나는 것이다.", author: "하워드 막스", book: "투자에 대한 생각" },
];

export default function Web() {
  const [randomQuote, setRandomQuote] = useState(quotes[0]);
  const theme = useTheme();

  useEffect(() => {
    setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

  return (
    <>
      <Head>
        <title>Value Investing - Insights & Tools</title>
      </Head>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header />

        <main className="max-w-7xl mx-auto px-4 py-8 pb-12 flex flex-col items-center justify-center min-h-[calc(100vh-64px)]">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 4, md: 8 },
              background: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              width: '100%',
              maxWidth: 'lg'
            }}
          >
            {/* Investors Image */}
            <Box
              sx={{
                width: '100%',
                maxWidth: '600px',
                mb: 6,
                borderRadius: 4,
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
              }}
            >
              <img
                src="/images/investors.png"
                alt="Warren Buffett, Peter Lynch, and Charlie Munger"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </Box>

            <FormatQuoteIcon sx={{ fontSize: 80, color: 'secondary.main', mb: 2, opacity: 0.5 }} />

            <Typography
              variant="h2"
              component="blockquote"
              sx={{
                mb: 4,
                fontStyle: 'italic',
                fontWeight: 300,
                color: 'text.primary',
                fontSize: { xs: '1.5rem', md: '3rem' }
              }}
            >
              &ldquo;{randomQuote.text}&rdquo;
            </Typography>

            <Box>
              <Typography variant="h5" color="secondary.light" gutterBottom fontWeight={600}>
                {randomQuote.author}
              </Typography>
              {randomQuote.book && (
                <Typography variant="body1" color="text.secondary">
                  {randomQuote.book}
                </Typography>
              )}
            </Box>
          </Paper>
        </main>
      </div>
    </>
  );
}
