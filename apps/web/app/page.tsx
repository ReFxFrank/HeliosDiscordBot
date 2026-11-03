import { redirect } from 'next/navigation';

/** The dashboard is the whole site: send visitors straight to it. */
export default function HomePage(): never {
  redirect('/servers');
}
