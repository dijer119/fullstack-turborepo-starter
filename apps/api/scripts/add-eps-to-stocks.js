const fs = require('fs');
const path = require('path');

/**
 * krx_stocks.json 파일에 EPS(주당순이익) 필드를 추가하는 스크립트
 *
 * EPS 계산식: EPS = (당기순이익) / (발행주식수)
 *
 * 현재 데이터에서:
 * - Marcap (시가총액) = Close (종가) × Stocks (발행주식수)
 * - 당기순이익 데이터가 없으므로, EPS는 null 또는 0으로 초기화
 */

const DATA_FILE_PATH = path.join(__dirname, '../data/krx_stocks.json');
const BACKUP_FILE_PATH = path.join(__dirname, '../data/krx_stocks.backup.json');

function addEpsToStocks() {
  try {
    console.log('📖 krx_stocks.json 파일 읽기...');
    const rawData = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
    const stocks = JSON.parse(rawData);

    console.log(`📊 총 ${stocks.length}개 종목 발견`);

    // 백업 파일 생성
    console.log('💾 백업 파일 생성...');
    fs.writeFileSync(BACKUP_FILE_PATH, rawData, 'utf-8');
    console.log(`✅ 백업 완료: ${BACKUP_FILE_PATH}`);

    // EPS 필드 추가
    console.log('🔧 EPS 필드 추가 중...');
    let addedCount = 0;
    let alreadyExistsCount = 0;

    const updatedStocks = stocks.map((stock, index) => {
      // 이미 EPS 필드가 있는지 확인
      if (stock.hasOwnProperty('EPS')) {
        alreadyExistsCount++;
        return stock;
      }

      // EPS 필드 추가 (초기값: null)
      // 실제 EPS 데이터는 별도로 수집하여 업데이트 필요
      const updatedStock = {
        ...stock,
        EPS: null  // 또는 0으로 설정 가능
      };

      addedCount++;

      // 진행상황 표시 (10% 단위)
      if ((index + 1) % Math.floor(stocks.length / 10) === 0) {
        const progress = Math.round(((index + 1) / stocks.length) * 100);
        console.log(`   진행: ${progress}% (${index + 1}/${stocks.length})`);
      }

      return updatedStock;
    });

    // 업데이트된 데이터 저장
    console.log('💾 업데이트된 데이터 저장 중...');
    fs.writeFileSync(
      DATA_FILE_PATH,
      JSON.stringify(updatedStocks, null, 2),
      'utf-8'
    );

    console.log('\n✅ 완료!');
    console.log(`   - 총 종목 수: ${stocks.length}`);
    console.log(`   - EPS 필드 추가: ${addedCount}개`);
    console.log(`   - 이미 존재: ${alreadyExistsCount}개`);
    console.log(`\n📝 참고: EPS 값은 null로 초기화되었습니다.`);
    console.log(`   실제 EPS 데이터는 별도로 수집하여 업데이트하세요.`);
    console.log(`\n🔄 백업 파일: ${BACKUP_FILE_PATH}`);
    console.log(`   문제가 있으면 백업 파일을 복원하세요.`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 스크립트 실행
console.log('🚀 EPS 필드 추가 스크립트 시작\n');
addEpsToStocks();
