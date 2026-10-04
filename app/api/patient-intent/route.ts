import { NextResponse } from 'next/server';

const fallback=(query:string)=>{
  const q=query.toLowerCase();
  const map:[string,string[]][]=[
    ['Dental implant',['implant','implants','missing tooth','missing teeth']],
    ['Root canal',['root canal','rct','tooth infection','infected tooth']],
    ['Braces / aligners',['braces','aligner','aligners','invisalign','crooked teeth']],
    ['Tooth pain',['tooth pain','toothache','pain in tooth','severe pain','dental pain']],
    ['Crown / bridge',['crown','bridge','broken tooth','cap for tooth']],
    ['Teeth cleaning',['cleaning','scaling','yellow teeth','tartar']],
    ['Wisdom tooth',['wisdom tooth','wisdom teeth']],
    ['Gum treatment',['gum','bleeding gums','gum pain','periodontal']],
    ['Cosmetic dentistry',['veneers','smile design','cosmetic','whitening','teeth whitening']],
    ['Pediatric dentistry',['child','children','kid','kids','pediatric']],
    ['Denture',['denture','dentures','false teeth']],
    ['Second opinion',['second opinion','review my treatment','another opinion']]
  ];
  const found=map.find(([,keys])=>keys.some(k=>q.includes(k)));
  const urgency=/severe|unbearable|swelling|bleeding|emergency|cannot sleep|can't sleep/.test(q)?'ASAP':/today|right now|immediately/.test(q)?'TODAY':/this week|soon/.test(q)?'THIS_WEEK':'FLEXIBLE';
  let score=35;
  if(found) score+=35;
  if(/price|cost|fee|budget|cheap|affordable/.test(q)) score+=5;
  if(/book|appointment|dentist|clinic|doctor|treatment/.test(q)) score+=15;
  if(urgency!=='FLEXIBLE') score+=10;
  return {treatment:found?.[0]||'Dental consultation',urgency,intentScore:Math.min(score,100),summary:'Initial intent classification'};
};

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const query=typeof body?.query==='string'?body.query.trim():'';
  if(query.length<8) return NextResponse.json({error:'Please describe the dental need in more detail.'},{status:400});
  const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
  if(!key) return NextResponse.json({...fallback(query),ai:false,provider:'DentalCare intent fallback'});
  const schema={type:'object',properties:{treatment:{type:'string'},urgency:{type:'string',enum:['FLEXIBLE','ASAP','TODAY','THIS_WEEK']},intentScore:{type:'integer',minimum:0,maximum:100},summary:{type:'string'}},required:['treatment','urgency','intentScore','summary']};
  try{
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({model:'gemini-3.8-flash',input:'You are DentalCare patient-intent classifier. Classify this dental enquiry for dentist matching. Do not diagnose or prescribe. Infer only likely service/need, urgency and intent strength. Enquiry:\n'+query,response_format:{type:'text',mime_type:'application/json',schema},store:false}),
      cache:'no-store'
    });
    if(!response.ok) throw new Error('Gemini API '+response.status);
    const json=await response.json();
    const parsed=JSON.parse(json.output_text||'{}');
    return NextResponse.json({...fallback(query),...parsed,ai:true,provider:'Gemini'});
  }catch{
    return NextResponse.json({...fallback(query),ai:false,provider:'DentalCare intent fallback'});
  }
}