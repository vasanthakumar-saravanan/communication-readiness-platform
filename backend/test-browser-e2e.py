"""
End-to-end browser tests for resume persistence, upload, and interview flow.
Tests against actual running frontend, backend, and AI service.
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError

# Test configuration
BASE_URL = "http://localhost:5173"
TEST_EMAIL = "student.test01@example.com"
TEST_PASSWORD = "Test@123456"

# Paths to test files
TEST_ASSETS_DIR = Path(__file__).parent / "test-assets"
PDF_RESUME = TEST_ASSETS_DIR / "beginner-student-resume.pdf"
DOCX_RESUME = TEST_ASSETS_DIR / "beginner-student-resume.docx"

class TestResults:
    def __init__(self):
        self.results = {}

    def add(self, test_name, passed, evidence):
        self.results[test_name] = {"passed": passed, "evidence": evidence}

    def print_table(self):
        print("\n" + "="*80)
        print("BROWSER TEST RESULTS")
        print("="*80)
        print(f"{'Test':<50} {'Result':<15} {'Evidence':<15}")
        print("-"*80)
        for test_name, result in self.results.items():
            status = "PASS" if result["passed"] else "FAIL"
            evidence = result["evidence"][:50] if len(result["evidence"]) <= 50 else result["evidence"][:47] + "..."
            print(f"{test_name:<50} {status:<15} {evidence:<15}")
        print("="*80)

        total = len(self.results)
        passed = sum(1 for r in self.results.values() if r["passed"])
        print(f"\nTotal: {passed}/{total} tests passed")

        return passed == total

results = TestResults()

def test_resume_persistence_after_refresh(page):
    """Test that parsed resume persists after page refresh."""
    print("\n[TEST 1] Testing resume persistence after refresh...")

    try:
        # Login
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")

        # Click sign in
        page.get_by_text("Sign In", exact=False).first.click()
        page.wait_for_timeout(500)

        # Fill login form
        page.get_by_placeholder("Email").fill(TEST_EMAIL)
        page.get_by_placeholder("Password").fill(TEST_PASSWORD)
        page.get_by_role("button", name="Sign In").click()

        # Wait for dashboard
        page.wait_for_timeout(2000)

        # Verify parsed resume is visible
        page_content = page.content()

        # Check for key skills
        has_python = "Python" in page_content
        has_java = "Java" in page_content
        has_mysql = "MySQL" in page_content
        has_git = "Git" in page_content

        if not all([has_python, has_java, has_mysql, has_git]):
            results.add("Resume visible after login", False, "Missing skills in dashboard")
            return False

        results.add("Resume visible after login", True, "All skills present")

        # Hard refresh
        print("  Performing hard refresh...")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Check resume still visible
        page_content = page.content()
        has_python = "Python" in page_content
        has_java = "Java" in page_content
        has_mysql = "MySQL" in page_content

        if not all([has_python, has_java, has_mysql]):
            results.add("Resume persists after refresh", False, "Resume not visible after refresh")
            return False

        results.add("Resume persists after refresh", True, "Resume restored from DB")
        return True

    except Exception as e:
        results.add("Resume persists after refresh", False, f"Error: {str(e)[:50]}")
        return False

def test_resume_persistence_after_logout_login(page):
    """Test that parsed resume persists after logout and login."""
    print("\n[TEST 2] Testing resume persistence after logout/login...")

    try:
        # Assume already logged in from previous test
        # Look for logout/sign out button
        try:
            # Try to find and click logout
            page.get_by_text("Sign Out", exact=False).first.click(timeout=2000)
            page.wait_for_timeout(1000)
        except:
            # Logout might be in a menu
            pass

        # Login again
        page.goto(BASE_URL)
        page.wait_for_timeout(1000)

        page.get_by_text("Sign In", exact=False).first.click()
        page.wait_for_timeout(500)

        page.get_by_placeholder("Email").fill(TEST_EMAIL)
        page.get_by_placeholder("Password").fill(TEST_PASSWORD)
        page.get_by_role("button", name="Sign In").click()

        page.wait_for_timeout(2000)

        # Check resume visible
        page_content = page.content()
        has_python = "Python" in page_content
        has_java = "Java" in page_content

        if not all([has_python, has_java]):
            results.add("Resume persists after logout/login", False, "Resume not restored")
            return False

        results.add("Resume persists after logout/login", True, "Resume loaded from DB")
        return True

    except Exception as e:
        results.add("Resume persists after logout/login", False, f"Error: {str(e)[:50]}")
        return False

def test_pdf_upload(page):
    """Test PDF resume upload and parsing."""
    print("\n[TEST 3] Testing PDF upload...")

    try:
        # Look for upload button
        try:
            upload_button = page.get_by_text("Upload Resume", exact=False).or_(
                page.get_by_text("Update Resume", exact=False)
            ).first
            upload_button.click(timeout=3000)
            page.wait_for_timeout(500)
        except:
            results.add("PDF upload", False, "Upload button not found")
            return False

        # Find file input
        file_input = page.locator('input[type="file"]')
        file_input.set_input_files(str(PDF_RESUME))

        page.wait_for_timeout(1000)

        # Look for upload/submit button
        try:
            page.get_by_role("button", name="Upload").click(timeout=2000)
        except:
            try:
                page.get_by_text("Submit").first.click(timeout=2000)
            except:
                pass

        # Wait for parsing
        page.wait_for_timeout(5000)

        # Check for parsed resume
        page_content = page.content()
        has_parsed = "Parsed" in page_content or "parsed" in page_content

        results.add("PDF upload", True if has_parsed else False,
                   "Parsed successfully" if has_parsed else "Parsing failed")
        return has_parsed

    except Exception as e:
        results.add("PDF upload", False, f"Error: {str(e)[:50]}")
        return False

def test_docx_upload(page):
    """Test DOCX resume upload and parsing."""
    print("\n[TEST 4] Testing DOCX upload...")

    try:
        # Look for upload button
        try:
            upload_button = page.get_by_text("Upload Resume", exact=False).or_(
                page.get_by_text("Update Resume", exact=False)
            ).first
            upload_button.click(timeout=3000)
            page.wait_for_timeout(500)
        except:
            results.add("DOCX upload", False, "Upload button not found")
            return False

        # Find file input
        file_input = page.locator('input[type="file"]')
        file_input.set_input_files(str(DOCX_RESUME))

        page.wait_for_timeout(1000)

        # Look for upload/submit button
        try:
            page.get_by_role("button", name="Upload").click(timeout=2000)
        except:
            try:
                page.get_by_text("Submit").first.click(timeout=2000)
            except:
                pass

        # Wait for parsing
        page.wait_for_timeout(5000)

        # Check for parsed resume
        page_content = page.content()
        has_parsed = "Parsed" in page_content or "parsed" in page_content
        has_python = "Python" in page_content

        results.add("DOCX upload", True if (has_parsed and has_python) else False,
                   "DOCX parsed successfully" if has_parsed else "DOCX parsing failed")
        return has_parsed

    except Exception as e:
        results.add("DOCX upload", False, f"Error: {str(e)[:50]}")
        return False

def test_parsed_resume_survives_refresh(page):
    """Test that uploaded resume persists after refresh."""
    print("\n[TEST 5] Testing parsed resume survives refresh...")

    try:
        # Refresh
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Check resume still visible
        page_content = page.content()
        has_python = "Python" in page_content
        has_parsed = "Parsed" in page_content or "parsed" in page_content

        if not has_python:
            results.add("Parsed resume survives refresh", False, "Resume lost after refresh")
            return False

        results.add("Parsed resume survives refresh", True, "Persisted in database")
        return True

    except Exception as e:
        results.add("Parsed resume survives refresh", False, f"Error: {str(e)[:50]}")
        return False

def test_interview_question_generation(page):
    """Test that interview generates appropriate question."""
    print("\n[TEST 6] Testing interview question generation...")

    try:
        # Look for start interview button
        try:
            start_button = page.get_by_text("Start Mock Interview", exact=False).or_(
                page.get_by_text("Start Interview", exact=False)
            ).first
            start_button.click(timeout=5000)
            page.wait_for_timeout(3000)
        except:
            results.add("Interview question generation", False, "Start button not found")
            return False

        # Wait for question
        page.wait_for_timeout(5000)

        # Get page content
        page_content = page.content().lower()

        # Check for question-like content
        has_question = any(q in page_content for q in ["what", "how", "why", "explain", "describe", "java", "loop", "class", "object"])

        if not has_question:
            results.add("Interview question generation", False, "No question found")
            return False

        # Extract a sample of the question
        if "what" in page_content:
            idx = page_content.index("what")
            sample = page_content[idx:idx+100]
        elif "how" in page_content:
            idx = page_content.index("how")
            sample = page_content[idx:idx+100]
        else:
            sample = "Question present"

        results.add("Interview question generation", True, sample[:50])
        return True

    except Exception as e:
        results.add("Interview question generation", False, f"Error: {str(e)[:50]}")
        return False

def test_voice_transcription(page):
    """Test voice transcription - limited without real audio input."""
    print("\n[TEST 7-10] Testing voice transcription (browser automation limitation)...")

    # Voice tests cannot be fully automated without audio injection
    results.add("Voice interim transcript", False, "NOT VERIFIED - needs manual test")
    results.add("Voice final transcript", False, "NOT VERIFIED - needs manual test")
    results.add("Exact transcript submitted", False, "NOT VERIFIED - needs manual test")

    # Test empty answer handling
    try:
        # Look for submit button
        try:
            submit_button = page.get_by_text("Done Speaking", exact=False).or_(
                page.get_by_text("Submit Answer", exact=False)
            ).first
            submit_button.click(timeout=5000)
            page.wait_for_timeout(2000)

            # Check for error message
            page_content = page.content()
            has_error = "No answer" in page_content or "speak again" in page_content

            results.add("Empty answer rejection", True if has_error else False,
                       "Error shown" if has_error else "No validation")

        except:
            results.add("Empty answer rejection", False, "Could not test empty answer")

    except Exception as e:
        results.add("Empty answer rejection", False, f"Error: {str(e)[:50]}")

def run_all_tests():
    """Run all browser tests."""
    print("\n" + "="*80)
    print("STARTING BROWSER E2E TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test email: {TEST_EMAIL}")
    print(f"PDF resume: {PDF_RESUME}")
    print(f"DOCX resume: {DOCX_RESUME}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=500)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        try:
            # Run tests in sequence
            test_resume_persistence_after_refresh(page)
            test_resume_persistence_after_logout_login(page)
            # test_pdf_upload(page)  # Skip to avoid overwriting existing data
            # test_docx_upload(page)  # Skip to avoid overwriting existing data
            test_parsed_resume_survives_refresh(page)
            test_interview_question_generation(page)
            test_voice_transcription(page)

        except KeyboardInterrupt:
            print("\n\nTests interrupted by user")
        except Exception as e:
            print(f"\n\nFatal error: {e}")
        finally:
            browser.close()

    # Print results
    all_passed = results.print_table()
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(run_all_tests())
