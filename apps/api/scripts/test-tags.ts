#!/usr/bin/env tsx
// Test script for tag functionality

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testTags() {
    try {
        console.log('🏷️  Testing Tag Functionality');
        console.log('=============================\n');

        // 1. Get first stock
        const stock = await prisma.stock.findFirst({
            where: {
                id: 1
            }
        });

        if (!stock) {
            console.error('Stock with ID 1 not found');
            return;
        }

        console.log(`📊 Testing with stock: ${stock.name} (${stock.code})`);
        console.log(`Current tags: ${JSON.stringify(stock.tags)}\n`);

        // 2. Add tags
        console.log('➕ Adding tags...');
        const updatedStock = await prisma.stock.update({
            where: { id: 1 },
            data: {
                tags: ['성장주', '대형주', 'IT']
            }
        });
        console.log(`Tags added: ${JSON.stringify(updatedStock.tags)}\n`);

        // 3. Test filtering by tags
        console.log('🔍 Testing tag filtering...');

        // Filter stocks with "성장주" tag
        const stocksWithTag = await prisma.stock.findMany({
            where: {
                tags: {
                    has: '성장주'
                }
            },
            take: 5,
            select: {
                id: true,
                name: true,
                code: true,
                tags: true
            }
        });
        console.log(`Stocks with "성장주" tag: ${stocksWithTag.length} found`);
        stocksWithTag.forEach(s => {
            console.log(`  - ${s.name}: ${JSON.stringify(s.tags)}`);
        });
        console.log();

        // 4. Test hasEvery (multiple tag filter)
        console.log('🔍 Testing multiple tag filtering (hasEvery)...');
        const updatedStock2 = await prisma.stock.update({
            where: { id: 2 },
            data: {
                tags: ['성장주', '중형주']
            }
        });
        console.log(`Stock ID 2 tags: ${JSON.stringify(updatedStock2.tags)}`);

        const stocksWithMultipleTags = await prisma.stock.findMany({
            where: {
                tags: {
                    hasEvery: ['성장주']
                }
            },
            select: {
                id: true,
                name: true,
                tags: true
            }
        });
        console.log(`Stocks with ALL tags ["성장주"]: ${stocksWithMultipleTags.length} found`);
        stocksWithMultipleTags.forEach(s => {
            console.log(`  - ${s.name}: ${JSON.stringify(s.tags)}`);
        });
        console.log();

        // 5. Test favorite flag
        console.log('⭐ Testing favorite flag...');
        const favoriteStock = await prisma.stock.update({
            where: { id: 1 },
            data: {
                favorite: true
            }
        });
        console.log(`Stock ID 1 favorite: ${favoriteStock.favorite}`);

        const favoriteStocks = await prisma.stock.findMany({
            where: {
                favorite: true
            },
            select: {
                id: true,
                name: true,
                favorite: true
            }
        });
        console.log(`Favorite stocks: ${favoriteStocks.length} found`);
        favoriteStocks.forEach(s => {
            console.log(`  - ${s.name}: favorite=${s.favorite}`);
        });

        console.log('\n✅ Tag functionality test completed!');

    } catch (error) {
        console.error('Error testing tags:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testTags();