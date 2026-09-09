function Pagination({
  page,
  pageInput,
  totalPages,
  onPageChange,
  onPageInputChange,
}) {
  function goToInputPage() {
    const targetPage = Math.min(
      Math.max(Number(pageInput) || 1, 1),
      totalPages,
    );

    onPageChange(targetPage);
  }

  return (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>

      <span>Page</span>

      <input
        type="number"
        min="1"
        max={totalPages}
        value={pageInput}
        onChange={(event) => onPageInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            goToInputPage();
          }
        }}
      />

      <span>/ {totalPages}</span>

      <button onClick={goToInputPage}>Go</button>

      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export default Pagination;
