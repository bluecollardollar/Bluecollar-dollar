const PRODUCTS = {
  1:["Magnetic Rechargeable Work Light",2499],
  2:["Compact Everyday Tech Organizer",1899],
  3:["Adjustable Phone Stand",1499],
  4:["Travel Packing Cube Set",2299],
  5:["Portable LED Utility Light",1999],
  6:["Cable & Charger Travel Kit",1699],
  7:["Foldable Storage Tote",2199],
  8:["Magnetic Parts Tray",1299]
};
export async function onRequestPost({request,env}) {
  const site=(env.SITE_URL||"").replace(/\/$/,"");
  if(!env.STRIPE_SECRET_KEY||!site) return reply({error:"Checkout is not configured."},503);
  const origin=request.headers.get("Origin");
  if(origin && origin!==site) return reply({error:"Request origin not allowed."},403);
  let body; try{body=await request.json()}catch{return reply({error:"Invalid cart."},400)}
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>20) return reply({error:"Cart is empty or invalid."},400);
  const quantities=new Map();
  for(const item of body.items){
    const id=Number(item.id),q=Number(item.quantity);
    if(!Number.isInteger(id)||!PRODUCTS[id]||!Number.isInteger(q)||q<1||q>10) return reply({error:"Invalid product or quantity."},400);
    quantities.set(id,(quantities.get(id)||0)+q);
  }
  const p=new URLSearchParams();
  p.set("mode","payment");p.set("success_url",site+"/success.html?session_id={CHECKOUT_SESSION_ID}");
  p.set("cancel_url",site+"/cancel.html");p.set("billing_address_collection","auto");
  p.set("shipping_address_collection[allowed_countries][0]","US");
  p.set("phone_number_collection[enabled]","true");
  p.set("metadata[store]","Bluecollar Dollar");
  p.set("metadata[fulfillment]","Manual - verify succeeded payment in Stripe Dashboard");
  let i=0;
  for(const [id,q] of quantities){
    const [name,amount]=PRODUCTS[id];
    p.set(`line_items[${i}][price_data][currency]`,"usd");
    p.set(`line_items[${i}][price_data][product_data][name]`,name);
    p.set(`line_items[${i}][price_data][unit_amount]`,String(amount));
    p.set(`line_items[${i}][quantity]`,String(q));i++;
  }
  const ship=Number(env.SHIPPING_AMOUNT_CENTS??"0");
  if(!Number.isInteger(ship)||ship<0||ship>100000)return reply({error:"Shipping setting is invalid."},500);
  p.set("shipping_options[0][shipping_rate_data][type]","fixed_amount");
  p.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]",String(ship));
  p.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]","usd");
  p.set("shipping_options[0][shipping_rate_data][display_name]","Standard shipping");
  // Placeholder estimate: change this to supplier-verified timing before going live.
  p.set("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]","business_day");
  p.set("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]","5");
  p.set("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]","business_day");
  p.set("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]","12");
  const r=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded"},body:p.toString()});
  const data=await r.json();
  if (!r.ok) {
  console.error("Stripe checkout error", {
    status: r.status,
    type: data.error?.type,
    code: data.error?.code,
    param: data.error?.param,
    message: data.error?.message
  });
  return reply({
    error: "Stripe checkout failed. Check Cloudflare logs."
  }, 502);
  }
  return reply({url:data.url});
}
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
