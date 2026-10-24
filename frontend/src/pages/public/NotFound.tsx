import { Button } from '@/components/radiant/button';
import { Container } from '@/components/radiant/container';
import { GradientBackground } from '@/components/radiant/gradient';
import { Navbar } from '@/components/radiant/navbar';
import { Heading, Lead } from '@/components/radiant/text';

export function NotFound() {
  return (
    <main>
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Container className="mt-16 pb-32">
        <Heading as="h1">Page not found.</Heading>
        <Lead className="mt-6">That page doesn’t exist.</Lead>
        <div className="mt-8"><Button href="/">Go home</Button></div>
      </Container>
    </main>
  );
}
