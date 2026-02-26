import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Worker Conversation | Home Grown AI',
  description: 'Interactive Worker conversation powered by Home Grown AI',
  openGraph: {
    title: 'Worker Conversation | Home Grown AI',
    description: 'Interactive Worker conversation powered by Home Grown AI',
    type: 'website',
  },
};

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
