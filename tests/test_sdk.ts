import { VideoSDK } from '../src/index';

async function test() {
  const sdk = new VideoSDK();
  const url = 'https://www.dailymotion.com/video/xa471tu';

  console.log(`--- Testing Dailymotion SDK: ${url} ---`);
  try {
    const info = await sdk.getInfo(url);
    console.log('Title:', info.title);
    console.log('Qualities found:', info.qualities.length);
    if (info.qualities.length > 0) {
        console.log(` - First quality: ${info.qualities[0].label}`);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

test();
