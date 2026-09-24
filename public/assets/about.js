(() => {
  const shelf = document.getElementById("aboutShelf");
  if (!shelf) return;

  const books = [...shelf.querySelectorAll("[data-about-book]")];

  function selectBook(selected) {
    books.forEach((book) => {
      const active = book === selected;
      const control = book.querySelector(".about-book-control");
      const detail = book.querySelector("[data-about-detail]");

      book.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
      detail.inert = !active;
      detail.setAttribute("aria-hidden", String(!active));
    });
  }

  books.forEach((book) => {
    book.querySelector(".about-book-control").addEventListener("click", () => selectBook(book));
  });

  selectBook(books.find((book) => book.classList.contains("is-active")) || books[0]);
})();
