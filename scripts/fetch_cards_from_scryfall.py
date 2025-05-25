import requests
import csv
import time
import sys
import os # Added for path manipulation and directory creation

# Scryfall API base URL
SCRYFALL_API_BASE_URL = "https://api.scryfall.com"

# Define basic land names to filter out
BASIC_LAND_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"]

def fetch_cards_for_set(set_code):
    """
    Fetches all card data for a given set code from the Scryfall API.
    Handles API pagination and respects Scryfall's requested delay.

    Args:
        set_code (str): The three-letter (or sometimes longer) code for the MTG set.

    Returns:
        list: A list of card objects (dictionaries) if successful,
              None if a critical API/network error occurs,
              or an empty list if the set is found but contains no cards.
    """
    all_cards_data = []
    next_page_url = f"{SCRYFALL_API_BASE_URL}/cards/search?q=e%3A{set_code.lower()}&unique=cards"

    print(f"Fetching data from Scryfall for set: {set_code.upper()}")
    print(f"Initial API call: {next_page_url}")

    page_num = 1
    while next_page_url:
        try:
            response = requests.get(next_page_url)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.HTTPError as e:
            error_details = {}
            try:
                error_details = e.response.json()
            except ValueError:
                pass

            if e.response.status_code == 404:
                if error_details.get("code") == "no_set" or "No set found for" in error_details.get("details", ""):
                    print(f"\nError: The set code '{set_code.upper()}' was not found on Scryfall.")
                    print(f"Details: {error_details.get('details', 'Please check the set code and try again.')}")
                elif error_details.get("code") == "bad_request" and "must contain at least 2 characters" in error_details.get("details", ""):
                     print(f"\nError: The set code '{set_code}' is too short. Please use a valid set code.")
                else:
                    print(f"\nError: API request failed with status {e.response.status_code} (Not Found).")
                    print(f"URL: {next_page_url}")
                    print(f"Scryfall details: {error_details.get('details', 'Ensure the set code is correct.')}")
            else:
                print(f"\nAn HTTP error occurred: {e}")
                print(f"URL: {next_page_url}")
                if error_details:
                    print(f"Scryfall error details: {error_details}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"\nA network error occurred: {e}")
            print(f"URL: {next_page_url}")
            return None
        except ValueError as e:
            print(f"\nError decoding JSON response from Scryfall: {e}")
            print(f"Response text: {response.text if response else 'No response object'}")
            return None

        fetched_cards_on_page = data.get('data', [])
        if not fetched_cards_on_page and page_num == 1 and not data.get('has_more'):
            print(f"No cards found for set '{set_code.upper()}'. The set might be empty or the code incorrect.")
            return []

        all_cards_data.extend(fetched_cards_on_page)
        print(f"Page {page_num}: Fetched {len(fetched_cards_on_page)} cards. (Total fetched so far: {len(all_cards_data)})")

        if data.get('has_more') and data.get('next_page'):
            next_page_url = data['next_page']
            page_num += 1
            time.sleep(0.1)
        else:
            next_page_url = None
    return all_cards_data

def write_cards_to_csv(cards_data, filename):
    """
    Writes extracted card data (name, rarity, color identity) to a CSV file.

    Args:
        cards_data (list): A list of card objects (dictionaries) from Scryfall.
        filename (str): The name of the CSV file to write to.
    """
    fieldnames = ['Name', 'Rarity', 'Color Identity']
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        processed_count = 0
        for card in cards_data:
            card_name = card.get('name', 'N/A')
            rarity = card.get('rarity', 'N/A').capitalize()
            color_identity_list = card.get('color_identity', [])
            if color_identity_list:
                color_identity_str = "".join(sorted(color_identity_list))
            else:
                color_identity_str = "Colorless"
            
            writer.writerow({
                'Name': card_name,
                'Rarity': rarity,
                'Color Identity': color_identity_str
            })
            processed_count += 1
        print(f"Successfully prepared and wrote {processed_count} cards to the CSV.")


def main():
    """
    Main function to drive the script: gets user input, fetches data, filters, and writes to CSV.
    """
    set_code = input("Enter the MTG set code (e.g., 'MKM', 'WOE', 'MH3'): ").strip()

    if not set_code:
        print("No set code entered. Exiting.")
        sys.exit(1)
    
    if len(set_code) < 2:
        print(f"The entered set code '{set_code}' is too short. Please enter a valid set code.")
        sys.exit(1)

    print(f"\nAttempting to fetch cards for set code: '{set_code.upper()}'...")
    cards = fetch_cards_for_set(set_code)

    if cards is None:
        print("\nFailed to retrieve card data due to an API or network error.")
        sys.exit(1)
    
    if not cards:
        print(f"\nNo cards were found for set '{set_code.upper()}'.")
        sys.exit(0)

    print(f"\nFetched a total of {len(cards)} cards for set '{set_code.upper()}'.")

    # (1) Filter out basic lands
    original_card_count = len(cards)
    cards = [card for card in cards if card.get('name') not in BASIC_LAND_NAMES]
    filtered_land_count = original_card_count - len(cards)
    
    if filtered_land_count > 0:
        print(f"Filtered out {filtered_land_count} basic land(s) ({', '.join(BASIC_LAND_NAMES)}).")
        print(f"{len(cards)} cards remaining to be written.")
    else:
        print("No basic lands matching the specified names found to filter.")

    if not cards:
        print(f"No cards remaining after filtering basic lands for set '{set_code.upper()}'.")
        print("The CSV file will not be created as there is no data to write.")
        sys.exit(0)

    # (2) Define and create the output directory relative to the script's location
    try:
        # Get the directory where the script itself is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        # Construct the target directory path: script_dir / ../public/assets/data
        relative_target_dir = os.path.join("..", "public", "assets", "data")
        # Create an absolute path for the output directory
        output_dir = os.path.abspath(os.path.join(script_dir, relative_target_dir))

        print(f"Output directory will be: {output_dir}")
        os.makedirs(output_dir, exist_ok=True) # Create directory if it doesn't exist
    except OSError as e:
        print(f"\nError creating output directory '{output_dir}': {e}")
        sys.exit(1)
    except Exception as e: # Catch other potential errors like __file__ not being defined in some contexts
        print(f"\nError determining script path or creating output directory: {e}")
        # Fallback to current working directory if script path is problematic
        print("Defaulting to saving in current working directory's 'output_data' folder.")
        output_dir = os.path.join(os.getcwd(), "output_data", "scryfall_exports") # A fallback path
        os.makedirs(output_dir, exist_ok=True)


    output_filename = os.path.join(output_dir, f"scryfall_export_{set_code.lower()}.csv")

    print(f"\nWriting data for {len(cards)} cards to '{output_filename}'...")

    try:
        write_cards_to_csv(cards, output_filename)
        print(f"\nSuccessfully wrote card data to '{output_filename}'.")
    except IOError as e:
        print(f"\nError writing to file '{output_filename}': {e}")
    except Exception as e:
        print(f"\nAn unexpected error occurred during CSV writing: {e}")

if __name__ == "__main__":
    main()
