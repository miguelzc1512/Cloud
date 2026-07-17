import translate from 'translate';

async function test() {
  try {
    const text = await translate('naturaleza', { from: 'es', to: 'en' });
    console.log('Translated:', text);
  } catch (e) {
    console.error('Translation error:', e);
  }
}
test();
