import React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import StocksScreen from '../src/screens/StocksScreen';

const StocksPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>주식 종목 조회 | MaddingStock</title>
        <meta name="description" content="KOSPI와 KOSDAQ 주식 종목 조회" />
      </Head>
      <StocksScreen />
    </>
  );
};

export default StocksPage;
