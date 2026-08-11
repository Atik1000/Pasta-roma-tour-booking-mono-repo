import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
} from '@pasta/ui';
import { formatDate } from '@pasta/utils';

import { ContactForm } from '@/components/content/contact-form';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';
import { getContentPage, getContentSlugs } from '@/lib/content-pages';

type Params = Promise<{ slug: string }>;

/** Only the registered slugs exist; anything else is a 404 rather than a stub. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getContentSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentPage(slug);

  if (!page) return { title: 'Page not found' };

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${page.slug}` },
  };
}

export default async function ContentPageRoute({ params }: { params: Params }) {
  const { slug } = await params;
  const page = getContentPage(slug);

  if (!page) notFound();

  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero title={page.title} description={page.description} laurels={false} />

        <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 lg:px-8">
          {page.updatedAt ? (
            <p className="text-muted-foreground mb-8 text-sm">
              Last updated {formatDate(page.updatedAt)}
            </p>
          ) : null}

          {page.blocks.length > 0 ? (
            <div className="flex flex-col gap-8">
              {page.blocks.map((block, index) => (
                <section key={index} className="flex flex-col gap-2">
                  {block.heading ? (
                    <h2 className="font-display text-xl font-semibold">{block.heading}</h2>
                  ) : null}
                  <p className="text-muted-foreground leading-relaxed">{block.body}</p>
                </section>
              ))}
            </div>
          ) : null}

          {page.faqs ? (
            <Card className="mt-8">
              <CardContent className="px-6 py-2">
                <Accordion type="single" collapsible>
                  {page.faqs.map((faq, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger>{faq.question}</AccordionTrigger>
                      <AccordionContent>{faq.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ) : null}

          {page.showContactForm ? <ContactForm className="mt-10" /> : null}
        </div>
      </main>

      <Footer />
    </>
  );
}
