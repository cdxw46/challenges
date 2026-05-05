import { Router } from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In production, this should use the real STRIPE_SECRET_KEY
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2026-03-25.dahlia',
});

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { items, customerEmail } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // MOCK CHECKOUT FOR DEMO
    const origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.json({ id: 'cs_test_mock', url: `${origin}/checkout/success?session_id=cs_test_mock` });

    /* REAL STRIPE IMPLEMENTATION
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100), // Stripe expects cents
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal', 'klarna'], // Added extra methods as requested
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/carrito`,
      customer_email: customerEmail,
    });

    res.json({ id: session.id, url: session.url });
    */
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

export default router;
