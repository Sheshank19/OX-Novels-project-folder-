const searchInput = document.getElementById("storySearch");
const storyCards = document.querySelectorAll(".story-card");
const storyCount = document.getElementById("storyCount");
const noResults = document.getElementById("noResults");
const modal = document.getElementById("membershipModal");
const closeModal = document.getElementById("closeModal");
const selectedStory = document.getElementById("selectedStory");
const storyButtons = document.querySelectorAll(".story-button");

function updateStoryCount() {
  const visibleStories = [...storyCards].filter(
    card => card.style.display !== "none"
  );

  storyCount.textContent = `${visibleStories.length} stories`;
  noResults.style.display = visibleStories.length === 0 ? "block" : "none";
}

searchInput.addEventListener("input", () => {
  const search = searchInput.value.trim().toLowerCase();

  storyCards.forEach(card => {
    const title = card.dataset.title.toLowerCase();
    card.style.display = title.includes(search) ? "" : "none";
  });

  updateStoryCount();
});

storyButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectedStory.textContent = button.dataset.story;
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
  });
});

function hideModal() {
  modal.classList.remove("show");
  document.body.style.overflow = "";
}

closeModal.addEventListener("click", hideModal);

modal.addEventListener("click", event => {
  if (event.target === modal) {
    hideModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    hideModal();
  }
});

document.getElementById("joinButton").addEventListener("click", () => {
  alert("Membership checkout will be connected here.");
});

document.getElementById("supportButton").addEventListener("click", () => {
  alert("OX Novels support payment will be connected here.");
});

function loginMessage() {
  alert("The OX Novels login system will be connected here.");
}

document.getElementById("loginButton").addEventListener("click", loginMessage);
document.getElementById("modalLogin").addEventListener("click", loginMessage);

updateStoryCount();
