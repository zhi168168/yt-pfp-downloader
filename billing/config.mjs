import { createPrivateKey } from 'node:crypto';
export function paymentMode(env, local = false) {
  const mode = env.WAFFO_ENVIRONMENT || (local ? 'test' : 'prod');
  if (!['test', 'prod'].includes(mode)) throw new Error('WAFFO_ENVIRONMENT must be test or prod');
  return mode;
}
export function billingConfig(env, local = false) {
  const environment = paymentMode(env, local);
  const fields = ['WAFFO_MERCHANT_ID','WAFFO_PRIVATE_KEY','WAFFO_STORE_ID','WAFFO_STARTER_PRODUCT_ID','WAFFO_PRO_PRODUCT_ID'];
  if (!fields.some(key => env[key])) return null;
  if (fields.some(key => !env[key])) throw new Error('Complete all YT PFP Waffo settings');
  if (env.WAFFO_STARTER_PRODUCT_ID === env.WAFFO_PRO_PRODUCT_ID) throw new Error('Plans require separate products');
  let privateKey = env.WAFFO_PRIVATE_KEY.replaceAll('\\n','\n').trim();
  if (!privateKey.includes('BEGIN')) privateKey = createPrivateKey({key:Buffer.from(privateKey,'base64'),format:'der',type:'pkcs8'}).export({format:'pem',type:'pkcs8'});
  return { merchantId:env.WAFFO_MERCHANT_ID, privateKey, environment, storeId:env.WAFFO_STORE_ID,
    products:{starter:env.WAFFO_STARTER_PRODUCT_ID,pro:env.WAFFO_PRO_PRODUCT_ID} };
}
