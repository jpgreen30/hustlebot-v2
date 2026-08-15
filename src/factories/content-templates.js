/**
 * CONTENT TEMPLATES
 *
 * Reusable templates for different content types:
 * - Guides (how-to, educational)
 * - Reviews (product, service)
 * - Comparisons (head-to-head)
 * - News & updates (timely information)
 * - Weekly journey content (lifecycle-driven)
 */

const TEMPLATES = {
  guide: {
    name: 'Guide',
    description: 'How-to, educational, or reference content',
    sections: [
      {
        name: 'introduction',
        title: 'Introduction',
        purpose: 'Hook reader, explain what they\'ll learn, show value',
        wordCount: 150,
        prompts: {
          opening: 'Create a compelling opening that addresses the reader\'s pain point for: {topic}',
          thesis: 'Summarize what readers will learn by reading this guide on {topic}',
          value: 'Explain the practical value and expected outcome of reading this guide'
        }
      },
      {
        name: 'context',
        title: 'Background & Context',
        purpose: 'Set the stage, explain why this matters',
        wordCount: 200,
        optional: true,
        prompts: {
          background: 'Provide background context on {topic} that helps readers understand the topic',
          importance: 'Explain why {topic} is important during this lifecycle stage'
        }
      },
      {
        name: 'mainContent',
        title: 'Main Content',
        purpose: 'Core educational material, steps, best practices',
        wordCount: 1200,
        subsections: [
          { title: 'Key Point 1', wordCount: 300 },
          { title: 'Key Point 2', wordCount: 300 },
          { title: 'Key Point 3', wordCount: 300 },
          { title: 'Common Mistakes', wordCount: 300 }
        ],
        prompts: {
          structure: 'Organize {topic} into key sections with practical examples',
          steps: 'Create clear, actionable steps for {topic}',
          tips: 'Provide expert tips and best practices for {topic}'
        }
      },
      {
        name: 'tools',
        title: 'Helpful Tools & Resources',
        purpose: 'Product recommendations, checklists, calculators',
        wordCount: 200,
        optional: true,
        prompts: {
          tools: 'Recommend 3-5 helpful tools for {topic}',
          checklist: 'Create a practical checklist for {topic}'
        }
      },
      {
        name: 'conclusion',
        title: 'Conclusion & Next Steps',
        purpose: 'Summarize, provide CTA',
        wordCount: 150,
        prompts: {
          summary: 'Summarize the key takeaways from this guide on {topic}',
          nextSteps: 'Suggest practical next steps for readers after reading this guide',
          cta: 'Create a compelling call-to-action related to {topic}'
        }
      }
    ],
    seoGuidelines: {
      targetKeywordDensity: '1-2%',
      headingStructure: 'h1, multiple h2, h3 as needed',
      idealWordCount: '1500-2500',
      internalLinks: '3-5',
      focusOn: ['main_keyword', 'related_keywords', 'long_tail_variations']
    },
    examples: {
      topics: [
        'Complete pregnancy guide by trimester',
        'Newborn feeding guide',
        'Sleep training guide',
        'Product safety guide',
        'Postpartum recovery guide'
      ]
    }
  },

  review: {
    name: 'Product Review',
    description: 'In-depth product evaluation with pros, cons, and recommendations',
    sections: [
      {
        name: 'introduction',
        title: 'Product Overview',
        purpose: 'Introduce product, explain why you\'re reviewing it',
        wordCount: 150,
        prompts: {
          intro: 'Create an engaging introduction for reviewing {product}',
          aboutProduct: 'Describe the key features and purpose of {product}'
        }
      },
      {
        name: 'research',
        title: 'Our Research Process',
        purpose: 'Explain how you evaluated the product',
        wordCount: 100,
        prompts: {
          methodology: 'Explain the testing methodology for {product} evaluation'
        }
      },
      {
        name: 'pros',
        title: 'Pros',
        purpose: 'List and explain key advantages',
        wordCount: 400,
        subsections: [
          { title: 'Advantage 1', wordCount: 100 },
          { title: 'Advantage 2', wordCount: 100 },
          { title: 'Advantage 3', wordCount: 100 },
          { title: 'Advantage 4', wordCount: 100 }
        ],
        prompts: {
          advantages: 'Identify and explain 4 key advantages of {product}'
        }
      },
      {
        name: 'cons',
        title: 'Cons',
        purpose: 'List and explain key limitations',
        wordCount: 300,
        subsections: [
          { title: 'Limitation 1', wordCount: 100 },
          { title: 'Limitation 2', wordCount: 100 },
          { title: 'Limitation 3', wordCount: 100 }
        ],
        prompts: {
          limitations: 'Identify and explain 3 key limitations or drawbacks of {product}'
        }
      },
      {
        name: 'scoring',
        title: 'Our Rating',
        purpose: 'Provide structured evaluation scores',
        wordCount: 150,
        metrics: [
          { name: 'Quality', scale: '1-5' },
          { name: 'Value for Money', scale: '1-5' },
          { name: 'Durability', scale: '1-5' },
          { name: 'Customer Support', scale: '1-5' },
          { name: 'Overall Rating', scale: '1-5' }
        ]
      },
      {
        name: 'comparison',
        title: 'How It Compares',
        purpose: 'Compare to similar products',
        wordCount: 200,
        optional: true,
        prompts: {
          comparison: 'Compare {product} to similar alternatives, explaining key differences'
        }
      },
      {
        name: 'whoIsItFor',
        title: 'Who Should Buy This?',
        purpose: 'Target audience and use cases',
        wordCount: 150,
        prompts: {
          audience: 'Describe the ideal customer for {product} and use cases'
        }
      },
      {
        name: 'verdict',
        title: 'Our Verdict',
        purpose: 'Final recommendation',
        wordCount: 150,
        prompts: {
          verdict: 'Provide a final, balanced recommendation for {product}'
        }
      }
    ],
    editorialNote: 'Never fabricate customer reviews or star ratings. Use actual data from verified reviews.',
    affiliateDisclosure: 'Required. Must clearly disclose affiliate relationships.',
    seoGuidelines: {
      targetKeywordDensity: '1-2%',
      includeProductName: true,
      compareToCompetitors: true,
      internalLinks: '2-3 to similar products'
    },
    examples: {
      products: [
        'Baby monitors',
        'Car seats',
        'Strollers',
        'Crib mattresses',
        'Prenatal vitamins'
      ]
    }
  },

  comparison: {
    name: 'Product Comparison',
    description: 'Head-to-head comparison of similar products',
    sections: [
      {
        name: 'introduction',
        title: 'Comparison Overview',
        purpose: 'Explain what\'s being compared and why',
        wordCount: 150,
        prompts: {
          intro: 'Create an engaging introduction comparing {products}',
          context: 'Explain why comparing {products} matters for the reader'
        }
      },
      {
        name: 'comparisonTable',
        title: 'Comparison Table',
        purpose: 'Quick reference matrix',
        format: 'table',
        columns: [
          'Feature',
          'Product A',
          'Product B',
          'Product C'
        ],
        features: [
          'Price',
          'Key Features',
          'Quality/Material',
          'Warranty',
          'Shipping',
          'Customer Rating'
        ]
      },
      {
        name: 'detailedComparison',
        title: 'Detailed Comparison',
        purpose: 'Deep dive into each product',
        wordCount: 800,
        subsections: [
          { title: 'Product A Analysis', wordCount: 250 },
          { title: 'Product B Analysis', wordCount: 250 },
          { title: 'Product C Analysis', wordCount: 300 }
        ],
        prompts: {
          analysis: 'Provide detailed analysis of {products}, highlighting strengths and weaknesses'
        }
      },
      {
        name: 'bestFor',
        title: 'Which Is Best For?',
        purpose: 'Recommend by use case',
        wordCount: 200,
        subsections: [
          { useCase: 'Budget-conscious parents', product: '' },
          { useCase: 'Premium quality seekers', product: '' },
          { useCase: 'Eco-conscious families', product: '' }
        ]
      },
      {
        name: 'verdict',
        title: 'Our Recommendation',
        purpose: 'Final verdict',
        wordCount: 150,
        prompts: {
          recommendation: 'Provide a balanced recommendation for {products} based on different needs'
        }
      }
    ],
    seoGuidelines: {
      targetKeywordDensity: '1-2%',
      includeVersusKeywords: true,
      compareTable: 'improves SEO and UX'
    },
    examples: {
      comparisons: [
        'Pampers vs Huggies vs Seventh Generation',
        'Dock vs Bassinet vs Bedside Sleeper',
        'Medela vs Spectra vs Lansinoh breast pumps'
      ]
    }
  },

  weeklyJourney: {
    name: 'Weekly Journey Content',
    description: 'Lifecycle-stage-specific content (weekly pregnancy, baby age updates)',
    sections: [
      {
        name: 'stageContext',
        title: 'What\'s Happening This Week',
        purpose: 'Explain fetal/baby development',
        wordCount: 250,
        prompts: {
          development: 'Describe fetal/baby development for {week_or_stage}',
          physicalChanges: 'Explain physical changes the parent can expect this week'
        }
      },
      {
        name: 'parentExperience',
        title: 'What You Might Be Experiencing',
        purpose: 'Address parent symptoms, feelings, concerns',
        wordCount: 200,
        prompts: {
          symptoms: 'List common symptoms and experiences for this stage',
          normalVersusWarning: 'Distinguish between normal variations and when to contact provider'
        }
      },
      {
        name: 'tips',
        title: 'Tips for This Week',
        purpose: 'Actionable, stage-appropriate advice',
        wordCount: 200,
        subsections: [
          { title: 'Tip 1', wordCount: 50 },
          { title: 'Tip 2', wordCount: 50 },
          { title: 'Tip 3', wordCount: 50 },
          { title: 'Tip 4', wordCount: 50 }
        ]
      },
      {
        name: 'milestones',
        title: 'Milestones to Watch For',
        purpose: 'Observable developments',
        wordCount: 100,
        format: 'checklist'
      },
      {
        name: 'healthcare',
        title: 'Healthcare Reminders',
        purpose: 'Appointments, screenings, vaccines',
        wordCount: 100,
        prompts: {
          appointments: 'List relevant healthcare appointments or screenings for this stage',
          questions: 'Suggest questions to ask healthcare provider this visit'
        }
      }
    ],
    mandatory: {
      disclaimers: 'Required for health-related content',
      providerReferences: 'Link to trustworthy medical sources'
    },
    seoGuidelines: {
      targetKeyword: '{week_or_stage} + specific focus',
      updateFrequency: 'weekly (52-40 weeks pregnancy, then by baby age)'
    },
    examples: {
      pregnancyWeeks: ['Week 8', 'Week 16', 'Week 28', 'Week 36'],
      babyAges: ['1 month', '3 months', '6 months', '12 months']
    }
  },

  news: {
    name: 'News & Safety Updates',
    description: 'Timely information about product recalls, health updates, safety info',
    sections: [
      {
        name: 'headline',
        title: 'The Update',
        purpose: 'What happened and why it matters',
        wordCount: 150,
        prompts: {
          headline: 'Create a clear, engaging headline for this news story',
          summary: 'Summarize the news update in 2-3 sentences'
        }
      },
      {
        name: 'details',
        title: 'What You Need to Know',
        purpose: 'Facts and details',
        wordCount: 300,
        prompts: {
          details: 'Provide comprehensive details about this update',
          context: 'Explain the background and context'
        }
      },
      {
        name: 'impact',
        title: 'How This Affects You',
        purpose: 'Practical implications',
        wordCount: 200,
        prompts: {
          impact: 'Explain how this news impacts parents and families',
          actions: 'Recommend specific actions parents should take, if any'
        }
      },
      {
        name: 'sources',
        title: 'Source & Learn More',
        purpose: 'Links to authoritative sources',
        wordCount: 100,
        format: 'links'
      }
    ],
    mandatory: {
      factAccuracy: 'Critical - all claims must be verified',
      disclaimers: 'Required for health-related news',
      sourceCitation: 'All facts must cite official sources'
    },
    examples: {
      topics: [
        'Product recalls',
        'New AAP/CDC guidelines',
        'Health warnings',
        'Safety updates',
        'Policy changes'
      ]
    }
  }
};

export { TEMPLATES };
