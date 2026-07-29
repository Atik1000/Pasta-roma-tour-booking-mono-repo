import { permanentRedirect } from 'next/navigation';

/**
 * "Products" appears in the navbar and footer of the designs, but no Products
 * screen was ever drawn and the catalogue is entirely tours. Rather than invent
 * a page or leave a dead link, the route redirects to the tour catalogue.
 *
 * If Products is meant to be something distinct — passes, gift cards,
 * merchandise — replace this with the real screen.
 */
export default function ProductsPage() {
  permanentRedirect('/tours');
}
