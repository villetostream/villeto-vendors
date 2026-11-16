import { z } from "zod";

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

export const signupSchema = z
  .object({
    password: z
      .string()
      .min(8, "Minimum 8 characters")
      .max(128, "Maximum 128 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[a-z]/, "Must contain lowercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirm_password: z.string().max(128, "Maximum 128 characters"),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────

export const businessIdentitySchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required").max(200),
  business_email: z.string().trim().email("Enter a valid email").max(254),
  registration_number: z.string().trim().min(3, "Registration number is required").max(100),
  country: z.string().trim().min(1, "Please select a country").max(100),
  business_address: z.string().trim().min(5, "Business address is required").max(500),
});

export const bankingSchema = z.object({
  bank_code: z.string().trim().min(1, "Select a bank").max(50),
  bank_name: z.string().trim().min(1, "Select a bank").max(150),
  account_number: z.string().trim().regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
  flag_note: z.string().max(500).optional(),
});

// ─────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────

export const invoiceLineItemSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1, "Item name is required").max(255),
  quantity: z.number().finite().min(1, "Quantity must be at least 1").max(1_000_000),
  unit_price: z.number().finite().min(0, "Unit price must be 0 or more").max(1_000_000_000),
});

export const createInvoiceSchema = z.object({
  order_id: z.string().max(128).optional(),
  delivery_date: z.string().min(1, "Delivery date is required").max(64),
  due_date: z.string().max(64).optional(),
  items: z
    .array(invoiceLineItemSchema)
    .min(1, "At least one item is required")
    .max(500, "Too many line items"),
});

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────

export const messageSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty").max(1000),
});

// ─────────────────────────────────────────────
// DELIVERY
// ─────────────────────────────────────────────

export const partialDeliverySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        delivered_quantity: z.number().finite().min(0).max(1_000_000),
      })
    )
    .max(500),
});

export type SignupFormData = z.infer<typeof signupSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type BusinessIdentityFormData = z.infer<typeof businessIdentitySchema>;
export type BankingFormData = z.infer<typeof bankingSchema>;
export type CreateInvoiceFormData = z.infer<typeof createInvoiceSchema>;
