// Kitepost after a postcard is sent: fill in the form and send it. Only the main page has the form.
const form = document.getElementById("form");
if (!form) return;
form.elements.to.value = "Amara Okafor";
form.elements.message.value = "Wish you were here. The sea is warmer than it looks.";
form.elements.from.value = "Sam";
form.requestSubmit();
