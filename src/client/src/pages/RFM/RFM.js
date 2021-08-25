import React from 'react';
import {matchPath} from "react-router";

import {
    Container,
    FormControl,
    FormControlLabel,
    Paper,
    Radio,
    RadioGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@material-ui/core';
import _ from 'lodash';
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import Box from "@material-ui/core/Box";
import {makeStyles} from "@material-ui/styles";
import {formatPhoneNumber} from "../../utils/utils";
import {useHistory} from "react-router-dom";


const useStyles = makeStyles({
    container: {
        maxHeight: 600,
    },
    tableRow: {
        "&:hover": {
            backgroundColor: "#E6F7FF",
            cursor: "pointer"
        }
    },
});

export function RFM(props) {
    const classes = useStyles();
    const history = useHistory();

    const [labels, setLabels] = React.useState([]);
    const [selectedLabel, setSelectedLabel] = React.useState("");
    const [participants, setParticipants] = React.useState(undefined);

    React.useEffect(() => {
        (async () => {
            let labelsResponse = await fetch(`/api/rfm/labels`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + props.access_token
                    }
                });
            labelsResponse = await labelsResponse.json();
            setLabels(labelsResponse.result);
            debugger;
            try {
                let state = JSON.parse(_.get(history, 'location.state'));
                let stateLabel = state.selectedLabel;
                if (stateLabel) {
                    await setSelectedLabel(stateLabel)
                    await handleLabelChange({target: {value: stateLabel}});
                }
            } catch {
            }

        })();
    }, []);

    const handleLabelChange = async (event) => {
        debugger;
        setSelectedLabel(event.target.value);
        let participantsResponse = await fetch(`/api/rfm/${event.target.value}/100`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + props.access_token
                }
            });
        participantsResponse = await participantsResponse.json();
        setParticipants(participantsResponse.result);
    };

    const onRowClick = (matching_id) => {
        const match = matchPath(`/360view/view/${matching_id}`, {
            path: "/360view/view/:matching_id",
            exact: true,
            params: {matching_id}
        });
        history.push(match.url, {
            state: JSON.stringify((
                {
                    url: `/rfm`,
                    selectedLabel
                }
            ))
        })
    }

    return (
        <Container maxWidth={"xl"}>
            <Box display="flex" justifyContent="center" pb={5}>
                <Typography variant={"h2"}>RFM Scores</Typography>
            </Box>
            <Grid container direction="row" justify={"flex-start"} spacing={2}>
                <Grid container item direction="column" xs={3}>
                    {_.isEmpty(labels) !== true &&
                    <Grid item>

                        <FormControl component="fieldset">
                            <Typography variant={"h5"}>
                                RFM Labels
                            </Typography>
                            <RadioGroup aria-label="labels" value={selectedLabel} onChange={handleLabelChange}>
                                {
                                    _.map(labels, labelData => {
                                        return <FormControlLabel value={labelData.rfm_label} control={<Radio/>}
                                                                 label={<Paper variant="outlined" elevation={3}>
                                                                     <Typography style={{
                                                                         backgroundColor: labelData.rfm_color,
                                                                         color: labelData.rfm_text_color,
                                                                         padding: 3
                                                                     }}>
                                                                         {labelData.rfm_label} ({labelData.count})
                                                                     </Typography>
                                                                 </Paper>}/>
                                    })
                                }
                            </RadioGroup>
                        </FormControl>
                    </Grid>}
                </Grid>
                <Grid container item direction="column" xs={8} spacing={2}>
                    <Grid item>
                        <Typography variant={"h5"}>
                            Showing 100 Results:
                        </Typography>
                    </Grid>
                    <Grid item>
                        {participants &&
                        <Grid container direction={"row"}>
                            <Paper>
                                <TableContainer className={classes.container}>
                                    <Table size="small" stickyHeader aria-label="sticky table">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell align="left">Match ID</TableCell>
                                                <TableCell align="left">First Name</TableCell>
                                                <TableCell align="left">Last Name</TableCell>
                                                <TableCell align="left">Email</TableCell>
                                                <TableCell align="left">Mobile</TableCell>
                                                <TableCell align="left">Source</TableCell>
                                                <TableCell align="left">ID in Source</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {
                                                _.map(participants, (row, index) => {
                                                    return <TableRow key={`${row.source_id}${index}`}
                                                                     onClick={() => onRowClick(row.matching_id)}
                                                                     className={classes.tableRow}>
                                                        <TableCell align="left">{row.matching_id}</TableCell>
                                                        <TableCell align="left">{row.first_name}</TableCell>
                                                        <TableCell align="left">{row.last_name}</TableCell>
                                                        <TableCell align="left">{row.email}</TableCell>
                                                        <TableCell
                                                            align="left">{formatPhoneNumber(row.mobile)}</TableCell>
                                                        <TableCell align="left">{row.source_type}</TableCell>
                                                        <TableCell align="left">{row.source_id}</TableCell>
                                                    </TableRow>
                                                })
                                            }
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>}
                    </Grid>
                </Grid>
            </Grid>
        </Container>

    );
}