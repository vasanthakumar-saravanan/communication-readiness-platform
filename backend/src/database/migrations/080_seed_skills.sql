-- M3: seed 21 skills across four categories
-- Must run before M2 can add skill tags to question_bank_items.
-- Uses 'category' column per database_schema (not 'domain' as in M3 checklist).

INSERT INTO performance.skills (name, category, description) VALUES
  -- TECHNICAL (7)
  ('System Design',               'TECHNICAL', 'Ability to design scalable distributed systems'),
  ('Data Structures & Algorithms','TECHNICAL', 'Proficiency in DSA problem-solving'),
  ('Object-Oriented Programming', 'TECHNICAL', 'OOP principles: encapsulation, inheritance, polymorphism'),
  ('Database Design',             'TECHNICAL', 'Relational and non-relational database design'),
  ('REST APIs',                   'TECHNICAL', 'RESTful API design and integration'),
  ('Cloud Architecture',          'TECHNICAL', 'Cloud-native design patterns and services'),
  ('Problem Solving',             'TECHNICAL', 'Analytical thinking and debugging under pressure'),

  -- COMMUNICATION (6)
  ('Fluency',                     'COMMUNICATION', 'Speaking fluency without hesitation or repetition'),
  ('Clarity',                     'COMMUNICATION', 'Clear and concise verbal communication'),
  ('Confidence',                  'COMMUNICATION', 'Self-confidence and composure during verbal assessment'),
  ('Active Listening',            'COMMUNICATION', 'Comprehension and response to interviewer cues'),
  ('Pace Control',                'COMMUNICATION', 'Maintaining optimal speech pace (120–150 WPM)'),
  ('Filler Word Avoidance',       'COMMUNICATION', 'Minimising filler words (um, uh, like, you know)'),

  -- BEHAVIORAL (5)
  ('Teamwork',                    'BEHAVIORAL', 'Collaboration and constructive team contribution'),
  ('Leadership',                  'BEHAVIORAL', 'Ability to guide and influence team outcomes'),
  ('Time Management',             'BEHAVIORAL', 'Prioritisation and adherence to deadlines'),
  ('Adaptability',                'BEHAVIORAL', 'Flexibility when facing changing requirements or environments'),
  ('Conflict Resolution',         'BEHAVIORAL', 'Addressing and resolving disagreements constructively'),

  -- DOMAIN_SPECIFIC (3)
  ('Data Science',                'DOMAIN_SPECIFIC', 'ML/AI, statistics, data analysis and visualisation'),
  ('Web Development',             'DOMAIN_SPECIFIC', 'Frontend and backend web technologies'),
  ('Mobile Development',          'DOMAIN_SPECIFIC', 'iOS, Android, and cross-platform development')

ON CONFLICT (category, name) DO NOTHING;
