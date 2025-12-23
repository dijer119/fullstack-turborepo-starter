#!/usr/bin/env tsx
// Comprehensive test for all stock features

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCompleteFeatures() {
    try {
        console.log('🧪 Comprehensive Stock Features Test');
        console.log('=====================================\n');

        // 1. Test favorite functionality
        console.log('⭐ Test 1: Favorite Functionality');
        const favoriteTest = await prisma.stock.update({
            where: { id: 10 },
            data: { favorite: true }
        });
        console.log(`✅ Stock ${favoriteTest.name} marked as favorite\n`);

        // 2. Test exclude functionality
        console.log('🚫 Test 2: Exclude Functionality');
        const excludeTest = await prisma.stock.update({
            where: { id: 11 },
            data: { exclude: true }
        });
        console.log(`✅ Stock ${excludeTest.name} marked as excluded\n`);

        // 3. Test tag functionality
        console.log('🏷️  Test 3: Tag Functionality');
        const tagTest = await prisma.stock.update({
            where: { id: 12 },
            data: {
                tags: ['테스트', '성장주', '고배당']
            }
        });
        console.log(`✅ Stock ${tagTest.name} tagged with: ${JSON.stringify(tagTest.tags)}\n`);

        // 4. Test ROE filtering
        console.log('📊 Test 4: ROE Filtering (ROE > 0)');
        const roePositive = await prisma.stock.count({
            where: {
                roe: { gt: 0 },
                exclude: false
            }
        });
        console.log(`✅ Found ${roePositive} stocks with positive ROE\n`);

        // 5. Test dividend yield filtering
        console.log('💰 Test 5: Dividend Yield Filtering');
        const highDividend = await prisma.stock.count({
            where: {
                dividendYield: { gte: 3 },
                exclude: false
            }
        });
        console.log(`✅ Found ${highDividend} stocks with dividend yield >= 3%\n`);

        // 6. Test sorting by stock value
        console.log('📈 Test 6: Stock Value Sorting');
        const topValueStocks = await prisma.stock.findMany({
            where: {
                exclude: false,
                stockValue: { not: null }
            },
            orderBy: {
                stockValue: { sort: 'desc', nulls: 'last' }
            },
            take: 5,
            select: {
                name: true,
                stockValue: true
            }
        });
        console.log('Top 5 stocks by value:');
        topValueStocks.forEach((stock, index) => {
            console.log(`  ${index + 1}. ${stock.name}: ${stock.stockValue?.toFixed(0) || 'N/A'}원`);
        });
        console.log();

        // 7. Test search functionality
        console.log('🔍 Test 7: Search Functionality');
        const searchResults = await prisma.stock.findMany({
            where: {
                OR: [
                    { name: { contains: '삼성', mode: 'insensitive' } },
                    { code: { contains: '0059' } }
                ]
            },
            take: 3,
            select: {
                name: true,
                code: true
            }
        });
        console.log('Search results for "삼성":');
        searchResults.forEach(stock => {
            console.log(`  - ${stock.name} (${stock.code})`);
        });
        console.log();

        // 8. Test favorite + ROE + dividend yield combined filter
        console.log('🎯 Test 8: Combined Filters');
        const combinedFilter = await prisma.stock.findMany({
            where: {
                favorite: true,
                roe: { gt: 0 },
                dividendYield: { gte: 2 },
                exclude: false
            },
            orderBy: {
                stockValue: { sort: 'desc', nulls: 'last' }
            },
            take: 5,
            select: {
                name: true,
                roe: true,
                dividendYield: true,
                stockValue: true
            }
        });
        console.log('Favorite stocks with ROE > 0 and dividend >= 2%:');
        combinedFilter.forEach(stock => {
            console.log(`  - ${stock.name}: ROE ${stock.roe?.toFixed(1)}%, Dividend ${stock.dividendYield?.toFixed(1)}%, Value ${stock.stockValue?.toFixed(0)}원`);
        });
        console.log();

        // 9. Test tag filtering
        console.log('🎨 Test 9: Tag Filtering');
        const taggedStocks = await prisma.stock.findMany({
            where: {
                tags: { has: '성장주' }
            },
            select: {
                name: true,
                tags: true
            }
        });
        console.log('Stocks tagged with "성장주":');
        taggedStocks.forEach(stock => {
            console.log(`  - ${stock.name}: ${JSON.stringify(stock.tags)}`);
        });
        console.log();

        // 10. Test all unique tags
        console.log('🗂️  Test 10: All Unique Tags');
        const allStocksWithTags = await prisma.stock.findMany({
            where: {
                tags: { isEmpty: false }
            },
            select: { tags: true }
        });
        const uniqueTags = new Set<string>();
        allStocksWithTags.forEach(stock => {
            stock.tags.forEach(tag => uniqueTags.add(tag));
        });
        console.log(`✅ Found ${uniqueTags.size} unique tags: ${Array.from(uniqueTags).join(', ')}\n`);

        // Summary
        console.log('📋 Test Summary');
        console.log('================');
        const summary = await prisma.stock.aggregate({
            where: { exclude: false },
            _count: true,
            _avg: {
                roe: true,
                dividendYield: true,
                stockValue: true
            }
        });

        const favoriteCount = await prisma.stock.count({
            where: { favorite: true }
        });

        const excludedCount = await prisma.stock.count({
            where: { exclude: true }
        });

        console.log(`Total active stocks: ${summary._count}`);
        console.log(`Favorite stocks: ${favoriteCount}`);
        console.log(`Excluded stocks: ${excludedCount}`);
        console.log(`Average ROE: ${summary._avg.roe?.toFixed(2) || 'N/A'}%`);
        console.log(`Average Dividend Yield: ${summary._avg.dividendYield?.toFixed(2) || 'N/A'}%`);
        console.log(`Average Stock Value: ${summary._avg.stockValue?.toFixed(0) || 'N/A'}원`);

        console.log('\n✅ All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testCompleteFeatures();