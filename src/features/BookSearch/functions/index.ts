const OpenBookLibraryAPI = {
  async search(query: string): Promise<
    { key: string; title: string; image: string; author: string; description: string }[]
  > {
    if(query=="") return [];
    try {
      const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        console.error("Open Library responded with", res.status, res.statusText);
        return [];
      }

      const data = await res.json();

      return (data.docs || []).slice(0, 20).map((book: {
        key?: string;
        title?: string;
        author_name?: string[];
        cover_i?: number;
        first_sentence?: string[];
      }) => {
        const key = book.key || "";
        const title = book.title || "Untitled";
        const author = book.author_name?.[0] || "Unknown Author";

        const image = book.cover_i
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
          : "https://placehold.co/200x300?text=No+Cover";

        const description = book.first_sentence?.[0] || "No description available.";

        return {
          key,
          title,
          author,
          image,
          description,
        };
      });
    } catch (error) {
      console.error("Failed to fetch from Open Library", error);
      return [];
    }
  },
};

export default OpenBookLibraryAPI;
