# Checkout and payment

Turning a cart into an order: details, delivery, payment and confirmation. Motif builds the interface with mock data only; charging cards and creating orders belong to the developer's back end and payment provider.

## Goal

- Complete a purchase quickly and safely.
- No surprises: the total, fees and delivery date are clear before people commit.
- Recover gracefully when something fails, without losing anything entered.

## Anatomy

- **Order summary:** items with image, name, options, quantity and price; quantities editable; a link back to the cart.
- **Contact and delivery details:** email, name and address, with address autocomplete.
- **Delivery options:** each with its price and expected date ("Arrives Thu 16 Oct").
- **Payment:** wallet buttons first (the platform's own pay buttons), then card fields that format as people type (spaces in the number) and show the card brand.
- **Promo code:** collapsed behind a quiet "Add a promo code" link.
- **Total:** subtotal, delivery, tax and fees itemised, then the total in `title` weight.
- **Primary button:** says the amount: "Pay $24.00", using `action-primary`.
- **Reassurance:** a short security note and a link to the refund policy, in `caption`.
- **Confirmation page:** order number, what happens next, the delivery estimate, and where to track it.

## Required states

- **Totals updating:** when quantity, delivery or a code changes, the total updates in place with a brief loading state.
- **Invalid card details:** inline, per field ("Card number is incomplete").
- **Payment declined:** keep everything entered, say why if the provider says, and offer another method.
- **Extra verification:** the bank's verification step, with clear return to checkout.
- **Processing:** the button shows progress and can't be pressed twice, so nobody is charged twice.
- **Success:** the confirmation page.
- **Item out of stock:** say which item, and offer to remove it or pick another option.
- **Address problem:** suggest a correction, and let people keep what they typed.
- **Guest checkout:** the full flow without an account.

## Common mistakes

- Forcing an account before paying → offer guest checkout, and an account afterwards with the details pre-filled.
- Fees revealed at the last step → show delivery, tax and fees as early as possible.
- Many separate steps → one page with clear sections where possible.
- Clearing card details after a decline → keep them (except the security code, if the provider requires it).
- "Continue" on the final step → the amount: "Pay $24.00".
- A prominent promo field → collapse it, so people don't leave to hunt for codes.
- Errors only at the top of the page → next to the field that needs fixing.

## Mobile and web

- **Mobile:** express wallets at the top; the total and Pay button pinned at the bottom; the numeric keypad for card numbers and dates; card and address autofill hints; the order summary collapsed to one line ("3 items · $24.00") that expands.
- **Web:** two columns on wide screens, details on one side and a sticky order summary with the total on the other; address autocomplete; a single page with sections.
- **Both:** realistic mock prices and products in one clearly named mock data file; never a real payment key in the code.
