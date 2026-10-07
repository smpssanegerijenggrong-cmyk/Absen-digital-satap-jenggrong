import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'SANJARA Hadir — Absensi Murid',description:'Setiap kehadiran, awal sebuah pembelajaran.',icons:{icon:'/branding/logo-sekolah.png',apple:'/branding/logo-sekolah.png'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
