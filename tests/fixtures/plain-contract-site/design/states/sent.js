// Kitepost after a postcard is sent: fill in the form and send it.
const form = document.getElementById("form");
form.elements.to.value = "Amara Okafor";
form.elements.message.value = "Wish you were here. The sea is warmer than it looks.";
form.elements.from.value = "Sam";
form.requestSubmit();
