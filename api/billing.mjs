import handler from '../accounts/runtime.mjs';
export const config = { api: { bodyParser: false } };
export default function billing(req,res) {
  const url = new URL(req.url,'https://www.ytpfp.com');
  const route = url.searchParams.get('__billingPath') || '';
  if (!/^[a-z/-]*$/.test(route)) { res.statusCode=400; return res.end('Invalid payment route'); }
  url.searchParams.delete('__billingPath'); req.url=`/api/billing/${route}${url.search}`;
  return handler(req,res);
}
