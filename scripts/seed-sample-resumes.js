const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.nkpdhoeluselsrfuqhai:TamilVasanth12345@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
});

const SAMPLE_RESUMES = {
  'student.real01@example.com': {
    text: 'Real Student One - Full Stack Developer with expertise in React, Node.js, Spring Boot, and cloud technologies.',
    hyperlinks: [
      { url: 'https://github.com/realstudent01', page: 1, type: 'external' },
      { url: 'https://linkedin.com/in/realstudent01', page: 1, type: 'external' }
    ],
    metadata: { page_count: 1, author: 'Real Student One' },
    skills: {
      languages: ['JavaScript', 'TypeScript', 'Java', 'Python', 'SQL'],
      frameworks: ['React', 'Next.js', 'Spring Boot', 'Node.js', 'Express'],
      databases: ['PostgreSQL', 'MongoDB', 'Redis'],
      tools: ['Docker', 'Git', 'AWS', 'Nginx']
    },
    projects: [
      {
        title: 'E-Commerce Platform',
        description: 'Full-stack e-commerce with payment integration',
        tech_stack: ['React', 'Node.js', 'PostgreSQL', 'Stripe', 'Docker']
      },
      {
        title: 'Real-Time Chat Application',
        description: 'WebSocket-based chat with group messaging',
        tech_stack: ['React', 'Socket.io', 'Express', 'MongoDB', 'Redis']
      }
    ],
    education: {
      degree: 'B.Tech Computer Science',
      institution: 'Test University',
      year: 2024
    }
  },

  'student.real02@example.com': {
    text: 'Real Student Two - Data Scientist specializing in Machine Learning, Deep Learning, and Data Analytics.',
    hyperlinks: [
      { url: 'https://github.com/realstudent02', page: 1, type: 'external' }
    ],
    metadata: { page_count: 1, author: 'Real Student Two' },
    skills: {
      languages: ['Python', 'R', 'SQL', 'JavaScript'],
      frameworks: ['TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy'],
      databases: ['PostgreSQL', 'MongoDB', 'MySQL'],
      tools: ['Jupyter', 'Git', 'Docker', 'AWS SageMaker']
    },
    projects: [
      {
        title: 'Customer Churn Prediction Model',
        description: 'ML model predicting customer churn with 89% accuracy',
        tech_stack: ['Python', 'Scikit-learn', 'Pandas', 'XGBoost', 'Flask']
      },
      {
        title: 'Image Classification CNN',
        description: 'Deep learning model for medical image classification',
        tech_stack: ['Python', 'TensorFlow', 'Keras', 'OpenCV', 'NumPy']
      }
    ],
    education: {
      degree: 'B.Tech Computer Science',
      institution: 'Test University',
      year: 2024
    }
  },

  'student.real03@example.com': {
    text: 'Real Student Three - Cloud & DevOps Engineer with focus on AWS, Kubernetes, and Infrastructure as Code.',
    hyperlinks: [
      { url: 'https://github.com/realstudent03', page: 1, type: 'external' }
    ],
    metadata: { page_count: 1, author: 'Real Student Three' },
    skills: {
      languages: ['Python', 'Go', 'Bash', 'JavaScript', 'YAML'],
      frameworks: ['Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins'],
      databases: ['PostgreSQL', 'Redis', 'DynamoDB'],
      tools: ['AWS', 'Azure', 'Git', 'Prometheus', 'Grafana']
    },
    projects: [
      {
        title: 'CI/CD Pipeline Automation',
        description: 'Automated deployment pipeline with Jenkins and Docker',
        tech_stack: ['Jenkins', 'Docker', 'Kubernetes', 'AWS', 'Terraform']
      },
      {
        title: 'Infrastructure Monitoring System',
        description: 'Full-stack monitoring with Prometheus and Grafana',
        tech_stack: ['Prometheus', 'Grafana', 'Python', 'AWS CloudWatch', 'Elasticsearch']
      }
    ],
    education: {
      degree: 'B.Tech Computer Science',
      institution: 'Test University',
      year: 2024
    }
  }
};

async function seedResumes() {
  console.log('=== SEEDING SAMPLE RESUMES ===\n');

  for (const [email, resumeData] of Object.entries(SAMPLE_RESUMES)) {
    try {
      const result = await pool.query(`
        UPDATE org.students s
        SET parsed_resume = $1, updated_at = now()
        FROM identity.users u
        WHERE s.user_id = u.id AND u.email = $2
        RETURNING s.id
      `, [JSON.stringify(resumeData), email]);

      if (result.rows.length > 0) {
        console.log(`✓ ${email}: Resume stored`);
        console.log(`  Domain: ${resumeData.skills.frameworks[0]}`);
        console.log(`  Projects: ${resumeData.projects.length}`);
      } else {
        console.log(`✗ ${email}: Student not found`);
      }
    } catch (error) {
      console.error(`✗ ${email}: Error -`, error.message);
    }
    console.log('');
  }

  await pool.end();
  console.log('=== SEEDING COMPLETE ===');
}

seedResumes();
