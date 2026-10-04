const GOOGLE_PLACES_URL='https://places.googleapis.com/v1/places:searchText';

const QUERIES=[
  'dentists in Hyderabad, Telangana, India',
  'dental clinics in Hyderabad, Telangana, India',
  'dental hospitals in Hyderabad, Telangana, India',
  'orthodontists in Hyderabad, Telangana, India',
  'dental implant clinics in Hyderabad, Telangana, India',
  'dentists in Banjara Hills, Hyderabad, Telangana, India',
  'dentists in Jubilee Hills, Hyderabad, Telangana, India',
  'dentists in Gachibowli, Hyderabad, Telangana, India',
  'dentists in Madhapur, Hyderabad, Telangana, India',
  'dentists in Kondapur, Hyderabad, Telangana, India',
  'dentists in Kukatpally, Hyderabad, Telangana, India',
  'dentists in Secunderabad, Telangana, India',
  'dentists in Dilsukhnagar, Hyderabad, Telangana, India',
  'dentists in Mehdipatnam, Hyderabad, Telangana, India',
  'dentists in Manikonda, Hyderabad, Telangana, India'
];

export type DentistPlace={
  id:string;
  name:string;
  address:string|null;
  mapsUri:string|null;
  latitude:number|null;
  longitude:number|null;
  primaryType:string|null;
  businessStatus:string|null
};

function getApiKey(){
  return process.env.GOOGLE_PLACES_API_KEY||'';
}

async function searchPlaces(textQuery:string){
  const apiKey=getApiKey();
  if(!apiKey) throw new Error('Google Places discovery is not configured. Add GOOGLE_PLACES_API_KEY in Vercel.');

  const response=await fetch(GOOGLE_PLACES_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':apiKey,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.businessStatus,places.googleMapsUri'
    },
    body:JSON.stringify({
      textQuery,
      languageCode:'en',
      regionCode:'IN',
      locationBias:{
        circle:{
          center:{latitude:17.3850,longitude:78.4867},
          radius:30000
        }
      }
    }),
    cache:'no-store'
  });

  if(!response.ok){
    const body=await response.text();
    throw new Error('Google Places error '+response.status+': '+body.slice(0,500));
  }

  const json=await response.json();
  return (json.places||[]) as any[];
}

export async function discoverHyderabadDentists(){
  const byId=new Map<string,DentistPlace>();

  for(const query of QUERIES){
    const places=await searchPlaces(query);

    for(const p of places){
      if(!p?.id) continue;

      byId.set(p.id,{
        id:p.id,
        name:p.displayName?.text||'Dental provider',
        address:p.formattedAddress||null,
        mapsUri:p.googleMapsUri||null,
        latitude:p.location?.latitude??null,
        longitude:p.location?.longitude??null,
        primaryType:p.primaryType||null,
        businessStatus:p.businessStatus||null
      });
    }
  }

  return [...byId.values()];
}
