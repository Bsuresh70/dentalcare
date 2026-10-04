import Link from 'next/link';

const content:Record<string,{title:string;description:string;keywords:string[]}> = {
  'dental-implants': {title:'Dental Implants in Hyderabad',description:'Find dental implant providers in Hyderabad based on your location, treatment need, budget and appointment preference.',keywords:['dental implant Hyderabad','implant dentist Hyderabad']},
  'root-canal': {title:'Root Canal Treatment in Hyderabad',description:'Find dentists for root canal treatment in Hyderabad and request an appointment.',keywords:['root canal Hyderabad','RCT dentist Hyderabad']},
  'braces-aligners': {title:'Braces & Aligners in Hyderabad',description:'Find orthodontic providers for braces and aligners in Hyderabad.',keywords:['braces Hyderabad','aligners Hyderabad','orthodontist Hyderabad']},
  'tooth-pain': {title:'Dentist for Tooth Pain in Hyderabad',description:'Have tooth pain? Tell DentalCare what you are experiencing and find suitable dental providers.',keywords:['tooth pain dentist Hyderabad','emergency dentist Hyderabad']},
  'teeth-cleaning': {title:'Teeth Cleaning in Hyderabad',description:'Find dental clinics for teeth cleaning and scaling in Hyderabad.',keywords:['teeth cleaning Hyderabad','dental scaling Hyderabad']},
  'wisdom-tooth': {title:'Wisdom Tooth Dentist in Hyderabad',description:'Find dental providers for wisdom tooth concerns in Hyderabad.',keywords:['wisdom tooth dentist Hyderabad']},
  'crown-bridge': {title:'Dental Crown & Bridge in Hyderabad',description:'Find dentists for crowns and bridges in Hyderabad.',keywords:['dental crown Hyderabad','dental bridge Hyderabad']},
  'gum-treatment': {title:'Gum Treatment in Hyderabad',description:'Find dental providers for gum and periodontal concerns in Hyderabad.',keywords:['gum treatment Hyderabad','periodontist Hyderabad']},
  'cosmetic-dentistry': {title:'Cosmetic Dentistry in Hyderabad',description:'Find cosmetic dental providers for smile and aesthetic dental needs.',keywords:['cosmetic dentist Hyderabad','smile design Hyderabad']},
  'pediatric-dentistry': {title:'Pediatric Dentist in Hyderabad',description:'Find dental providers for children in Hyderabad.',keywords:['pediatric dentist Hyderabad','kids dentist Hyderabad']}
};

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const item=content[slug]||content['tooth-pain'];
  return {title:item.title+' | DentalCare',description:item.description,keywords:item.keywords,alternates:{canonical:'/find-dentist/'+slug}};
}

export default async function TreatmentLanding({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const item=content[slug]||content['tooth-pain'];
  return <main className="page">
    <header className="pageHead">
      <div>
        <p className="eyebrow">AI DENTAL PATIENT CONCIERGE · HYDERABAD</p>
        <h1>{item.title}</h1>
        <p className="muted">{item.description}</p>
      </div>
    </header>
    <section className="heroCard">
      <div>
        <p className="eyebrow">SMART PATIENT MATCHING</p>
        <h2>Describe your problem. DentalCare helps you find suitable options.</h2>
        <p>You can tell us about your symptoms, preferred area, urgency and budget in your own words. DentalCare converts that enquiry into a structured request for dentist matching.</p>
        <Link className="primary" href="/patient-search">Find my dentist with AI</Link>
      </div>
    </section>
    <section className="grid2" style={{marginTop:18}}>
      <div className="panel"><h3>What DentalCare considers</h3><div className="action"><span className="actionIcon">✓</span><div><strong>Treatment need</strong><small>Matches your stated requirement with available dental services.</small></div></div><div className="action"><span className="actionIcon">✓</span><div><strong>Location</strong><small>Helps prioritize clinics in your preferred city or area.</small></div></div><div className="action"><span className="actionIcon">✓</span><div><strong>Urgency & preferences</strong><small>Prioritizes appropriate options based on your request.</small></div></div></div>
      <div className="panel"><h3>Need help now?</h3><p className="muted">For severe pain, swelling, bleeding or other urgent symptoms, seek prompt professional dental assessment.</p><Link className="tableButton" href="/find-dentist">Open dentist matching</Link></div>
    </section>
    <div className="patientNote"><strong>Important</strong><span>DentalCare does not diagnose conditions or prescribe treatment. Final diagnosis, treatment and fees must be confirmed by a qualified dental professional.</span></div>
  </main>
}
