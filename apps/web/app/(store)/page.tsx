import { HomePage } from "@/components/home/home-page";
import {
  getCollectionViews,
  getFeaturedProductViews,
  getStoreShellView,
} from "@/lib/catalog";

export default async function StoreHomePage() {
  const [{ announcements }, featuredProducts, collections] = await Promise.all([
    getStoreShellView(),
    getFeaturedProductViews(),
    getCollectionViews(),
  ]);

  return (
    <HomePage
      announcements={announcements}
      featuredProducts={featuredProducts}
      collections={collections}
    />
  );
}
