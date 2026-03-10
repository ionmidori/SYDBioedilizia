import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const blogDirectory = path.join(process.cwd(), '../docs/blog');

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  author: string;
  datePublished: string;
  content: string;
};

export function getBlogSlugs(): string[] {
  try {
    return fs.readdirSync(blogDirectory).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, ''));
  } catch (error) {
    console.error('Error reading blog directory:', error);
    return [];
  }
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  try {
    const fullPath = path.join(blogDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      slug,
      title: data.title || 'Senza titolo',
      description: data.description || '',
      author: data.author || 'Team Ristrutturazioni',
      datePublished: data.datePublished || new Date().toISOString().split('T')[0],
      content,
    };
  } catch (error) {
    console.error(`Error reading blog post ${slug}:`, error);
    return null;
  }
}

export function getAllBlogPosts(): BlogPost[] {
  const slugs = getBlogSlugs();
  const posts = slugs
    .map((slug) => getBlogPostBySlug(slug))
    .filter((post): post is BlogPost => post !== null)
    .sort((post1, post2) => (post1.datePublished > post2.datePublished ? -1 : 1));
  return posts;
}
