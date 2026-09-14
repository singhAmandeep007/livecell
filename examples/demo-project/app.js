let n = 0;
document.getElementById("go").addEventListener("click", () => {
  n += 1;
  const li = document.createElement("li");
  li.textContent = `clicked ${n}×`;
  document.getElementById("out").append(li);
  console.log("button clicked", n); // piped back into the notebook by livecell
});
