import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException  # Ensure this import is present
import time
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, Document
from llama_index.core import VectorStoreIndex, StorageContext, load_index_from_storage

import os
from llama_index.llms.openai import OpenAI
import hashlib
import customprint
import vectorstore  # Import vectorstore for vector store management
from llama_index.core.settings import Settings  # Import Settings
from dotenv import load_dotenv
from urllib.parse import urljoin, urlparse  # Import urljoin and urlparse
from vectorstore import VectorStoreManager

driver = None
# Initialize LLamaIndex and vector database

def initialize_llama_index(save_location):
    load_dotenv()
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
        
    if os.path.exists(save_location):
        storage_context = StorageContext.from_defaults(persist_dir=save_location)
        return load_index_from_storage(storage_context)
    
    # Use OpenAI's model directly with the settings
    models = ["gpt-4-1106-preview", "gpt-3.5-turbo", "gpt-4", "gpt-4-32k", "gpt-4-turbo", "gpt-4-turbo-preview"]

    Settings.llm = OpenAI(model=models[0], api_key=openai_api_key, temperature=0)
    return VectorStoreIndex([], service_context=Settings)  # Use Settings instead of ServiceContext

# Scrape a page
def scrape_page(url, use_webdriver):
    parsed_url = urlparse(url)

    # Use Selenium for pages with query parameters if use_webdriver is True
    if parsed_url.query or use_webdriver:
        return scrape_with_selenium(url)
    # Use requests/BeautifulSoup for pages without query parameters
    else:
        return scrape_with_requests(url)

def scrape_with_requests(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        print("scraped (requests)", url)
        return text
    except requests.RequestException as e:
        print(f"Failed to retrieve {url} with requests: {e}")
        return None

def scrape_with_selenium(url):
    global driver
    if driver is None:  # Initialize the driver only once
        chrome_options = Options()
        # Remove headless for debugging
        # chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")  # Add this line
        
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

    try:
        print("get")
        driver.get(url)
        print("wait")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Check for the "maybeLater" button and click it if it exists
        # try:
        #     maybe_later_button = WebDriverWait(driver, 5).until(
        #         EC.element_to_be_clickable((By.CSS_SELECTOR, '[data-testid="maybeLater"]'))
        #     )
        #     maybe_later_button.click()
        #     time.sleep(2)  # Wait for any potential changes after clicking
        #     print("Clicked 'maybeLater' button.")
        # except Exception as e:
        #     print(f"'maybeLater' button not found or could not be clicked: {e}")

        print("sleep")
        time.sleep(2)
        
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        
        print("scraped (selenium)", url)
        return text
    except WebDriverException as e:
        print(f"WebDriver error for {url}: {e}")
        return None
    except Exception as e:
        print(f"Failed to retrieve {url} with Selenium: {e}")
        return None

# Ensure to quit the driver when done
# def quit_driver():
#     global driver
#     if driver:
#         driver.quit()
#         driver = None

# Function to recursively scrape the entire site incrementally (generator)
def scrape_site(base_url, useWebDriver, visited_urls=None):
    if visited_urls is None:
        visited_urls = set()
    
    # Normalize the URL
    parsed_url = urlparse(base_url)
    normalized_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
    if parsed_url.query:  # Include query parameters
        normalized_url += f"?{parsed_url.query}"
    
    if normalized_url in visited_urls:
        return

    visited_urls.add(normalized_url)

    # Scrape the current page
    page_content = scrape_page(normalized_url,useWebDriver)  # Updated to use Selenium-based scrape_page
    if page_content:
        yield (normalized_url, page_content)
    
    # Find all links on the current page and scrape them incrementally
    try:
        response = requests.get(normalized_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        for link in soup.find_all('a', href=True):
            href = link['href']
            full_url = urljoin(normalized_url, href)
            parsed_full_url = urlparse(full_url)
            
            # Check if the URL is within the same domain
            if parsed_full_url.netloc == parsed_url.netloc:
                # Handle both path-based and query-based pagination
                if parsed_full_url.path.startswith(parsed_url.path) or parsed_full_url.query.startswith(parsed_url.query):
                    normalized_full_url = f"{parsed_full_url.scheme}://{parsed_full_url.netloc}{parsed_full_url.path}"
                    if parsed_full_url.query:  # Include query parameters
                        normalized_full_url += f"?{parsed_full_url.query}"
                    
                    if normalized_full_url not in visited_urls:
                        # Recursively yield scraped data from linked pages
                        yield from scrape_site(normalized_full_url, useWebDriver, visited_urls,)
    except requests.RequestException as e:
        print(f"Failed to retrieve links from {normalized_url}: {e}")

# Hash the content of a page
def hash_content(content):
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

# Check if a document with the same URL exists and if the hash is different
def needs_update(existing_docs, url, new_hash):
    for doc in existing_docs:
        if doc.metadata.get("url") == url and doc.metadata.get("hash") == new_hash:
            return False  # No need to update if the hash matches
    return True

# Function to save scraped content into LLamaIndex with hashing logic
def save_to_vector_db(index, scraped_page):
    existing_docs = index.docstore.docs.values()  # Get all existing documents from the index
    
    url, content = scraped_page
    content_hash = hash_content(content)
    
    # Check if the page already exists and needs an update
    if needs_update(existing_docs, url, content_hash):
        # Create a document with metadata including the URL and hash
        doc = Document(
            text=content,
            metadata={"url": url, "hash": content_hash}
        )
        # Insert document into the index with the metadata
        index.insert(doc)

# Modify the scrapeData function
def create_scraper_store(store_type, index_path):
    # This function is no longer needed as VectorStoreManager handles store creation
    pass

def maintain_scraper_store(store):
    # This function is no longer needed as VectorStoreManager handles store maintenance
    pass

def scrapeData(url, store_name, useWebdriver=False):
    vector_store_manager = VectorStoreManager()
    index = vector_store_manager.add_vector_store(store_name, "basic")
    # Scrape the website incrementally
    for scraped_page in scrape_site(url, useWebdriver):
        # Save each scraped page to the vector database
        save_to_vector_db(index, scraped_page)

    # The index is automatically persisted by the VectorStoreManager

if __name__ == "__main__":
    customprint.makeCustomPrint("out")  # Call your custom print function

    # Example usage
    base_url = "https://yeshid.com/blog?46d72648_page=4"
    store_name = "yeshid"

    # Call the scrapeData function to start the process
    scrapeData(base_url, store_name, useWebdriver=True)
    # quit_driver()  # Quit the driver when done