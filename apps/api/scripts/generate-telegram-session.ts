import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';

const apiId = 20844279;
const apiHash = '03e6e214da9ce37028e81d0701875722';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function generateSession() {
  console.log('🔐 Telegram 세션 문자열 생성기');
  console.log('================================\n');

  const stringSession = new StringSession(''); // 빈 세션으로 시작

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  console.log('📱 Telegram 계정으로 로그인합니다...\n');

  await client.start({
    phoneNumber: async () => {
      const phone = await question('전화번호를 입력하세요 (예: +821012345678): ');
      return phone;
    },
    password: async () => {
      const password = await question('2단계 인증 비밀번호를 입력하세요 (없으면 Enter): ');
      return password || '';
    },
    phoneCode: async () => {
      const code = await question('Telegram에서 받은 인증 코드를 입력하세요: ');
      return code;
    },
    onError: (err) => {
      console.error('❌ 오류 발생:', err);
    },
  });

  console.log('\n✅ 로그인 성공!\n');

  // 세션 문자열 저장
  const sessionString = client.session.save() as unknown as string;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 생성된 TELEGRAM_SESSION_STRING:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(sessionString);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('💾 .env 파일에 다음과 같이 추가하세요:\n');
  console.log(`TELEGRAM_SESSION_STRING=${sessionString}\n`);

  console.log('⚠️  이 문자열은 안전하게 보관하세요!');
  console.log('   이 문자열이 있으면 인증 없이 계정에 접근할 수 있습니다.\n');

  // 연결 테스트
  console.log('🧪 연결 테스트 중...');
  const me = await client.getMe();
  console.log(`✅ 연결됨: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})\n`);

  await client.disconnect();
  console.log('👋 연결 종료');

  rl.close();
  process.exit(0);
}

generateSession().catch((error) => {
  console.error('❌ 세션 생성 실패:', error);
  rl.close();
  process.exit(1);
});

