import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find a Dentist with AI | DentalCare',
  description: 'Describe your dental problem in natural language and DentalCare helps you find suitable dentists based on treatment, urgency, location and budget.',
  keywords: ['find dentist','dentist near me','dentist Hyderabad','dental implant Hyderabad','root canal Hyderabad','braces Hyderabad','tooth pain dentist'],
  alternates: { canonical: '/patient-search' },
  openGraph: {
    title: 'Find the Right Dentist with AI | DentalCare',
    description: 'Tell DentalCare what dental help you need and get matched with suitable dental providers.',
    type: 'website'
  }
};

export default function PatientSearchLayout({children}:{children:React.ReactNode}){
  return children;
}
