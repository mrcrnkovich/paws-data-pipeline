import os , sys, traceback
import pandas as pd

from flask import current_app
from api import admin_api
from pipeline import calssify_new_data, clean_and_load_data, archive_rows, match_data, log_db
from config import RAW_DATA_PATH
from config import engine
from models import Base
from rfm_funcs.create_scores import create_scores

def start_flow():

    job_id = admin_api.start_job()
    job_outcome = None
    trace_back_string = None


    if not job_id:
        current_app.logger.info('Failed to get job_id')
        job_outcome = 'busy'

    else:

        try:

            log_db.log_exec_status(job_id, 'start_flow', 'executing', '')

            file_path_list = os.listdir(RAW_DATA_PATH)

            if file_path_list:
                with engine.connect() as connection:
                    Base.metadata.create_all(connection)

                    # Get previous version of pdp_contacts table, which is used later to classify new records
                    pdp_contacts_df = pd.read_sql_table('pdp_contacts', connection)
                    pdp_contacts_df = pdp_contacts_df[pdp_contacts_df["archived_date"].isnull()]
                    pdp_contacts_df = pdp_contacts_df.drop(columns=['archived_date', 'created_date', '_id', 'matching_id'])

                    current_app.logger.info('Loaded {} records from pdp_contacts table'.format(pdp_contacts_df.shape[0]))

                    # Clean the input data and normalize/rename columns
                    # Populate new records in secondary tables (donations, volunteer shifts)
                    # input - existing files in path
                    # output - normalized object of all entries, as well as the input json rows for primary sources
                    log_db.log_exec_status(job_id, 'clean_and_load', 'executing', '')
                    normalized_data, source_json, manual_matches_df = clean_and_load_data.start(connection, pdp_contacts_df, file_path_list)

                    # Standardize column data types via postgres (e.g. reading a csv column as int vs. str)
                    # (If additional inconsistencies are encountered, may need to enforce the schema of
                    # the contacts loader by initializing it from pdp_contacts.)
                    normalized_data.to_sql('_temp_pdp_contacts_loader', connection, index=False, if_exists='replace')
                    normalized_data = pd.read_sql_table('_temp_pdp_contacts_loader', connection)

                    # Classifies rows to old rows that haven't changed, updated rows and new rows - compared to the existing state of the DB
                    log_db.log_exec_status(job_id, 'classify', 'executing', '')
                    rows_classified = calssify_new_data.start(pdp_contacts_df, normalized_data)

                    # Archives rows the were updated in the current state of the DB (changes their archived_date to now)
                    archive_rows.archive(connection, rows_classified["updated"])

                    # Match new+updated records against previous version of pdp_contacts database, and
                    # write these rows to the database.
                    match_data.start(connection, rows_classified, manual_matches_df, job_id)

                    # Copy raw input rows to json fields in pdp_contacts,
                    # using a temporary table to simplify the update code.
                    current_app.logger.info('Saving json of original rows to pdp_contacts')
                    source_json.to_sql('_temp_pdp_contacts_loader', connection, index=False, if_exists='replace')
                    # https://www.postgresql.org/docs/8.4/sql-update.html
                    connection.execute('''
                        UPDATE pdp_contacts pdp
                        SET json = to_json(temp.json)
                        FROM _temp_pdp_contacts_loader temp
                        WHERE
                            pdp.source_type = temp.source_type AND
                            pdp.source_id = temp.source_id AND
                            pdp.archived_date IS NULL
                    ''')

                current_app.logger.info('Finished flow script run, running RFM scoring')

                score_result = create_scores()  # Run RFM scoring on newly-processed donations
                current_app.logger.info('Scored ' + str(score_result) + ' tuples')

                job_outcome = 'completed'
                log_db.log_exec_status(job_id, 'flow', 'complete', '' )



            else: # No files in list
                current_app.logger.info('No files to process')
                job_outcome = 'nothing to do'  
                log_db.log_exec_status(job_id, 'flow', 'complete', '' )


        except Exception as e:
              current_app.logger.error(e)
              trace_back_string = traceback.format_exc()
              current_app.logger.error(trace_back_string)
            
        finally:
            if job_outcome != 'completed':  
                
                log_db.log_exec_status(job_id, 'flow', 'error', trace_back_string )
                current_app.logger.error("Uncaught error status, setting job status to \'error\' ")
                job_outcome = 'error'
                return 'error'

    return job_outcome